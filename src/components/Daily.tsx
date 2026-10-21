'use client';
/**
 * The daily card: an interesting fact and a general-knowledge question, first thing each day.
 * A correct answer (typos forgiven) wins a gold DR token. Answers live in this browser and,
 * when signed in, on the reader's account (daily_answers), merged both ways.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import * as D from '../lib/daily/daily';
import { supabaseBrowser } from '../lib/supabase/browser';
import { track } from '../lib/reader/track';
import { useReader } from './ReaderContext';

// ---------------------------------------------------------------- store (this browser)

const londonDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

let state: D.DailyState | null = null;
const subs = new Set<() => void>();
function read(): D.DailyState {
  if (state) return state;
  try {
    state = D.normaliseDaily(JSON.parse(localStorage.getItem(D.DAILY_KEY) ?? 'null'));
  } catch {
    state = D.emptyDaily();
  }
  return state;
}
function write(next: D.DailyState) {
  state = next;
  try {
    localStorage.setItem(D.DAILY_KEY, JSON.stringify(next));
  } catch {
    // private mode: keep it in memory for this visit
  }
  subs.forEach((f) => f());
}
const EMPTY = D.emptyDaily();

export function useDailyState(): D.DailyState | null {
  const st = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    read,
    () => EMPTY,
  );
  return st === EMPTY ? null : st;
}

/** Records gold tokens given for something (once per reason), e.g. securing a username. */
export const addAward = (reason: string, amount: number) => write(D.award(read(), reason, amount));

/** Tokens just won (signing up, securing a username), for the celebration. */
export interface Won { reason: string; amount: number }
const wonListeners = new Set<(won: Won[]) => void>();
export function onTokensWon(cb: (won: Won[]) => void) {
  wonListeners.add(cb);
  return () => void wonListeners.delete(cb);
}
export const celebrate = (won: Won[]) => won.length && wonListeners.forEach((f) => f(won));

/** Should the card open by itself now? Once per London day. */
export const dailyDue = () => read().seen !== londonDay();
export const markDailySeen = () => write({ ...read(), seen: londonDay() });

// ---------------------------------------------------------------- account sync

async function pushAnswer(day: string, result: D.Result) {
  const db = supabaseBrowser();
  if (!db) return;
  const { data } = await db.auth.getUser();
  if (!data.user) return;
  // "ignoreDuplicates": the account keeps the first answer for a day
  await db.from('daily_answers').upsert({ day, result }, { onConflict: 'user_id,day', ignoreDuplicates: true });
}

/** On sign-in: bring the account's answers here and send this browser's up. Quietly does nothing if unavailable. */
export function DailySync() {
  const { user } = useReader();
  useEffect(() => {
    const db = supabaseBrowser();
    if (!db || !user) return;
    let gone = false;
    (async () => {
      const { data, error } = await db.from('daily_answers').select('day, result');
      if (error || gone) return;
      const remote = (data ?? []) as { day: string; result: D.Result }[];
      const have = new Set(remote.map((r) => r.day));
      const local = read();
      const missing = Object.entries(local.ans).filter(([day]) => !have.has(day)).map(([day, result]) => ({ day, result }));
      if (missing.length) await db.from('daily_answers').upsert(missing, { onConflict: 'user_id,day', ignoreDuplicates: true });
      if (!gone) write(D.mergeDaily(read(), remote));
      // tokens given for other things, like securing a username
      const { data: awards } = await db.from('token_awards').select('reason, amount, created_at');
      if (gone) return;
      const before = read().awards ?? {};
      const fresh: Won[] = [];
      for (const a of (awards ?? []) as { reason: string; amount: number; created_at: string }[]) {
        // celebrate tokens won in the last quarter of an hour (not old ones arriving on a new device)
        if (!before[a.reason] && Date.now() - Date.parse(a.created_at) < 15 * 60_000) fresh.push({ reason: a.reason, amount: a.amount });
        write(D.award(read(), a.reason, a.amount));
      }
      celebrate(fresh);
      // answered the questionnaire before signing up: once those answers are on the account, so are the tokens
      if (read().awards?.questionnaire && !(awards ?? []).some((a: { reason: string }) => a.reason === 'questionnaire')) {
        setTimeout(() => void db.rpc('dr_claim_questionnaire_award'), 2500);
      }
    })();
    return () => {
      gone = true;
    };
  }, [user]);
  return null;
}

// ---------------------------------------------------------------- pieces

export function GoldToken({ size = 28, spin = false }: { size?: number; spin?: boolean }) {
  return (
    <svg className={`gtoken${spin ? ' spin' : ''}`} viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <defs>
        <radialGradient id="gt-g" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset=".45" stopColor="#f2c23a" />
          <stop offset="1" stopColor="#b8860b" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="url(#gt-g)" stroke="#8a6408" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="17.5" fill="none" stroke="#8a6408" strokeWidth="1" strokeDasharray="2.2 2" opacity=".7" />
      <text x="24" y="29.5" textAnchor="middle" fontFamily="var(--f-disp)" fontWeight="800" fontSize="15" fill="#0d1836" letterSpacing="-.5">DR</text>
    </svg>
  );
}

/** The gold-token pill for the deck and scroll views: count, and opens today's card. */
export function DailyBadge() {
  const st = useDailyState();
  const { setOverlay } = useReader();
  if (!st) return null;
  const n = D.tokens(st), done = !!st.ans[londonDay()];
  return (
    <button className={`rpill gpill${done ? '' : ' due'}`} onClick={() => setOverlay({ kind: 'daily' })}
      aria-label={`${done ? "Today's fact and question" : "Today's question, not answered yet"}. You have ${n} gold DR token${n === 1 ? '' : 's'}.`}>
      <GoldToken size={18} /> {n}
    </button>
  );
}

// ---------------------------------------------------------------- the card

export function DailyCard() {
  const { closeOverlay, user, setOverlay } = useReader();
  const st = useDailyState();
  const today = londonDay();
  const fact = D.factFor(today), q = D.questionFor(today);
  const [guess, setGuess] = useState('');
  const [verdict, setVerdict] = useState<D.Verdict | null>(null);
  const [msg, setMsg] = useState('');
  const inp = useRef<HTMLInputElement>(null);
  const result = st?.ans[today];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeOverlay();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [closeOverlay]);
  useEffect(() => {
    // focus the box on keyboards, not on phones, so the fact isn't hidden behind the keyboard
    if (!result && !matchMedia('(pointer: coarse)').matches) inp.current?.focus({ preventScroll: true });
  }, [result]);

  const settle = (r: D.Result) => {
    write(D.answer(read(), today, r));
    void pushAnswer(today, r);
    track('puzzle_done', { game: 'dq', how: r });
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (result) return;
    if (!guess.trim()) {
      setMsg('Type an answer, or tap "Don\'t know".');
      return;
    }
    const v = D.check(guess, q);
    setVerdict(v);
    settle(v.ok ? 'correct' : 'wrong');
  };

  const n = st ? D.tokens(st) : 0;
  const streak = st ? D.goldStreak(st, today) : 0;
  const dateLabel = new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="daily" role="dialog" aria-modal="true" aria-labelledby="daily-h">
      <div className="daily-card">
        <div className="daily-top">
          <span className="daily-date">{dateLabel}</span>
          <span className="daily-count" aria-label={`${n} gold DR tokens`}><GoldToken size={20} /> {n}</span>
          <button className="daily-x" onClick={closeOverlay} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <section className="daily-fact">
          <h2 id="daily-h" className="daily-k">Did you know?</h2>
          <p>{fact}</p>
        </section>
        <section className="daily-q" aria-labelledby="daily-qk">
          <h2 id="daily-qk" className="daily-k">Today&apos;s question <span className="daily-win"><GoldToken size={16} /> Win a gold DR token</span></h2>
          <p className="daily-qt">{q.q}</p>
          {!result ? (
            <form className="daily-form" onSubmit={submit} noValidate>
              <input ref={inp} type="text" value={guess} onChange={(e) => { setGuess(e.target.value); setMsg(''); }}
                aria-label="Your answer" placeholder="Your answer" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" maxLength={60} />
              <button className="pill solid" type="submit">Answer</button>
              <button className="pill" type="button" onClick={() => { setVerdict(null); settle('dontknow'); }}>Don&apos;t know</button>
              <p className="daily-hint" role="status">{msg || "Spelling doesn't need to be perfect. One go per day."}</p>
            </form>
          ) : (
            <div className={`daily-res ${result}`} role="status">
              {result === 'correct' ? (
                <>
                  <GoldToken size={64} spin />
                  <h3>Correct! You win a gold DR token.</h3>
                  <p>
                    {verdict?.ok && !verdict.exact ? <>We accepted &ldquo;{guess.trim()}&rdquo; for <b>{q.a[0]}</b>. </> : <>The answer: <b>{q.a[0]}</b>. </>}
                    You have <b>{n}</b> gold token{n === 1 ? '' : 's'}{streak > 1 ? <>, and a {streak}-day streak</> : null}.
                  </p>
                </>
              ) : (
                <>
                  <h3>{result === 'dontknow' ? 'Now you know.' : 'Not this time.'}</h3>
                  <p>The answer: <b>{q.a[0]}</b>.{result === 'wrong' && verdict && guess.trim() ? <> You said &ldquo;{guess.trim()}&rdquo;.</> : null} A new question comes tomorrow.</p>
                </>
              )}
              {q.note && <p className="muted">{q.note}</p>}
              {!user && n > 0 && (
                <p className="daily-keep">Sign up free and win <b>10 more gold tokens</b>, kept on your profile on every device. <button className="linkish" onClick={() => setOverlay({ kind: 'account', reason: 'daily' })}>Sign up</button></p>
              )}
            </div>
          )}
        </section>
        <div className="daily-foot">
          <button className="pill solid" onClick={closeOverlay}>{result ? "Read today's news" : 'Later'}</button>
        </div>
      </div>
    </div>
  );
}
