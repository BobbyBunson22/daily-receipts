'use client';
/**
 * "Secure your username": a pop-up that offers 5 gold DR tokens for claiming a unique username
 * on a free account ("jay" -> Jay’s Receipts, and nobody else can have it). Readers who aren't
 * signed in pick the name first; it's claimed as soon as they've signed in.
 */
import { useEffect, useRef, useState } from 'react';

import { NAME_MAX, brandFor, cleanName } from '../lib/reader/name';
import { setName } from '../lib/reader/state';
import { track } from '../lib/reader/track';
import { supabaseBrowser } from '../lib/supabase/browser';
import { AuthForm } from './AuthForm';
import { GoldToken, type Won, addAward, celebrate } from './Daily';
import { useReader } from './ReaderContext';

const KEY = 'dr.claim.v1';
const TOKENS = 5;
/** Tokens for signing up, given by the server when an account is created. */
export const SIGNUP = 10;
const londonDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

interface ClaimMemo { last?: string; snooze?: string; pending?: string }
function memo(): ClaimMemo {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as ClaimMemo;
  } catch {
    return {};
  }
}
function remember(patch: ClaimMemo) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...memo(), ...patch }));
  } catch {
    // private mode: the pop-up may show again
  }
}

/** Should the pop-up open by itself now? At most once a day, never while snoozed, never once secured. */
export function claimDue(secured: string): boolean {
  if (secured || !supabaseBrowser()) return false;
  const m = memo(), today = londonDay();
  return m.last !== today && !(m.snooze && m.snooze >= today);
}
export const markClaimShown = () => remember({ last: londonDay() });

type Result = { ok: true; name: string; awarded: number } | { ok: false; reason: string };

export async function claim(name: string): Promise<Result> {
  const db = supabaseBrowser();
  if (!db) return { ok: false, reason: 'unavailable' };
  const { data, error } = await db.rpc('dr_claim_username', { p_name: name });
  if (error || !data) return { ok: false, reason: error?.message ?? 'error' };
  return data as Result;
}

export const why = (reason: string) =>
  ({
    taken: 'Someone already has that one. Try another.',
    reserved: "That one's reserved. Try another.",
    'not allowed': "That name isn't allowed. Try another.",
    'too short': 'At least 2 characters.',
    'too long': `At most ${NAME_MAX} characters.`,
  })[reason] ?? (/only/.test(reason) ? 'Letters, numbers, spaces, hyphens and full stops only.' : "Couldn't check that name. Try again.");

/** Is this name free? Asked as they type, a moment after they stop. */
function useAvailable(name: string) {
  const [state, setState] = useState<{ name: string; status: string }>({ name: '', status: '' });
  useEffect(() => {
    const db = supabaseBrowser();
    if (!db || cleanName(name).length < 2) return;
    let gone = false;
    const t = setTimeout(async () => {
      const { data } = await db.rpc('dr_username_available', { p_name: cleanName(name) });
      if (!gone) setState({ name, status: typeof data === 'string' ? data : 'error' });
    }, 350);
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [name]);
  if (cleanName(name).length < 2) return name ? 'too short' : '';
  if (!supabaseBrowser()) return '';
  return state.name === name ? state.status : 'checking';
}

/** After signing in from the pop-up, claim the name they picked. */
export function ClaimWatcher() {
  const { user, update, toast } = useReader();
  const busy = useRef(false);
  // a sign-in link carries the name (/?claim=jay), as it may open in a different browser
  useEffect(() => {
    const u = new URL(location.href);
    const name = cleanName(u.searchParams.get('claim') ?? '');
    if (!u.searchParams.has('claim')) return;
    if (name) remember({ pending: name });
    u.searchParams.delete('claim');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }, []);
  useEffect(() => {
    const pending = memo().pending;
    if (!user || !pending || busy.current) return;
    busy.current = true;
    void claim(pending).then((r) => {
      remember({ pending: undefined });
      busy.current = false;
      if (r.ok) {
        update((x) => ({ ...setName(x, r.name), secured: r.name }));
        if (r.awarded) addAward('username', r.awarded);
        track('settings', { name: 'secured', awarded: r.awarded });
        celebrate([{ reason: 'username', amount: r.awarded }].filter((w) => w.amount));
      } else toast(`Couldn't secure “${pending}”: ${why(r.reason)}`);
    });
  }, [user, update, toast]);
  return null;
}

const WON_FOR: Record<string, string> = { signup: 'for signing up', username: 'for securing your username' };

/** The celebration: gold tokens just won, and what for. */
export function TokensCard({ won }: { won: Won[] }) {
  const { closeOverlay, st } = useReader();
  const total = won.reduce((a, w) => a + w.amount, 0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeOverlay();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [closeOverlay]);
  return (
    <div className="daily claim" role="dialog" aria-modal="true" aria-labelledby="won-h">
      <div className="daily-card">
        <div className="daily-top">
          <span className="daily-date">{st.secured ? brandFor(st.secured) : 'Welcome'}</span>
          <button className="daily-x" onClick={closeOverlay} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="claim-tokens" aria-hidden="true">
          {Array.from({ length: Math.min(total, 7) }, (_, i) => <span key={i} style={{ animationDelay: `${i * 90}ms` }}><GoldToken size={42} spin /></span>)}
        </div>
        <section className="claim-done" role="status">
          {won.some((w) => w.reason === 'username') && st.secured && <p className="won-k">{brandFor(st.secured)} is yours, locked in.</p>}
          <h2 id="won-h">You&apos;ve won {total} gold DR tokens</h2>
          <ul className="won-list">{won.map((w) => <li key={w.reason}><b>{w.amount}</b> {WON_FOR[w.reason] ?? ''}</li>)}</ul>
          <p>They&apos;re on your account, on every device.</p>
          <p className="claim-prize">Gold tokens unlock free prizes. What they are is still a secret: watch this space.</p>
          <button className="pill solid" onClick={closeOverlay}>Back to the news</button>
        </section>
      </div>
    </div>
  );
}

export function ClaimCard({ done }: { done?: { name: string; awarded: number } }) {
  const { st, user, update, closeOverlay } = useReader();
  const [draft, setDraft] = useState(st.name);
  const [step, setStep] = useState<'pick' | 'signup'>('pick');
  const [result, setResult] = useState(done ?? null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const name = cleanName(draft);
  const status = useAvailable(draft);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeOverlay();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [closeOverlay]);

  const notNow = () => {
    remember({ snooze: londonDay(new Date(Date.now() + 2 * 864e5)) });
    track('settings', { name: 'claim_later' });
    closeOverlay();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (status !== 'ok') return setErr(status && status !== 'checking' ? why(status) : 'Checking that name…');
    if (!user) {
      // keep the name; it's claimed the moment they've signed in
      remember({ pending: name });
      update((x) => setName(x, name));
      track('signup_start', { from: 'claim' });
      return setStep('signup');
    }
    setBusy(true);
    const r = await claim(name);
    setBusy(false);
    if (!r.ok) return setErr(why(r.reason));
    update((x) => ({ ...setName(x, r.name), secured: r.name }));
    if (r.awarded) addAward('username', r.awarded);
    track('settings', { name: 'secured', awarded: r.awarded });
    setResult({ name: r.name, awarded: r.awarded });
  };

  return (
    <div className="daily claim" role="dialog" aria-modal="true" aria-labelledby="claim-h">
      <div className="daily-card">
        <div className="daily-top">
          <span className="daily-date">{result ? 'Secured' : 'Free, takes a minute'}</span>
          <button className="daily-x" onClick={result ? closeOverlay : notNow} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="claim-tokens" aria-hidden="true">
          {Array.from({ length: result || user ? TOKENS : 7 }, (_, i) => <span key={i} style={{ animationDelay: `${i * 90}ms` }}><GoldToken size={result ? 46 : 38} spin={!!result} /></span>)}
        </div>
        {result ? (
          <section className="claim-done" role="status">
            <h2 id="claim-h">{brandFor(result.name)} is yours</h2>
            <p>{result.awarded ? <>You&apos;ve won <b>{result.awarded} gold DR tokens</b>. They&apos;re on your account, on every device.</> : <>Nobody else can have it now.</>}</p>
            <p className="claim-prize">Gold tokens unlock free prizes. What they are is still a secret: watch this space.</p>
            <button className="pill solid" onClick={closeOverlay}>Back to the news</button>
          </section>
        ) : step === 'signup' ? (
          <section>
            <h2 id="claim-h">One step left</h2>
            <p>Sign up free and <b>{brandFor(name)}</b> is yours, with <b>{TOKENS + SIGNUP} gold DR tokens</b>: {SIGNUP} for signing up and {TOKENS} for your username.</p>
            <AuthForm from="claim" next={`/?claim=${encodeURIComponent(name)}`} />
            <button className="linkish" onClick={() => setStep('pick')}>Change the name</button>
          </section>
        ) : (
          <section>
            <h2 id="claim-h">Secure your username</h2>
            <p>Make it <b>{brandFor(name || 'your')}</b>, so nobody else can have it. Secure it free and win <b>{user ? TOKENS : TOKENS + SIGNUP} gold DR tokens</b>{user ? '' : `: ${SIGNUP} for signing up and ${TOKENS} for your username`}.</p>
            <form className="namerow claim-form" onSubmit={submit} noValidate>
              <input type="text" value={draft} onChange={(e) => { setDraft(e.target.value); setErr(''); }} maxLength={NAME_MAX + 10}
                aria-label="Your username" placeholder="e.g. jay" autoComplete="nickname" autoCapitalize="words" spellCheck={false} enterKeyHint="go" />
              <button className="pill solid" type="submit" disabled={busy}>{busy ? 'Securing…' : user ? 'Secure it' : 'Next'}</button>
            </form>
            <p className={`claim-status ${status === 'ok' ? 'ok' : status && status !== 'checking' ? 'no' : ''}`} role="status">
              {err || (status === 'ok' ? `✓ ${name} is free` : status === 'checking' ? 'Checking…' : status ? why(status) : ' ')}
            </p>
            <p className="claim-prize">Gold tokens unlock free prizes, to be revealed soon.</p>
            <button className="linkish" onClick={notNow}>Not now</button>
          </section>
        )}
      </div>
    </div>
  );
}
