'use client';
/**
 * The questionnaire: how useful and trusted the edition is, and what readers would pay for a
 * membership and want in it. Open to everyone; one set of answers per reader per edition, and
 * sending again updates it. The first time someone completes it they win 10 gold DR tokens
 * (on their account when signed in; on this browser until they sign in, then on the account).
 */
import { useEffect, useId, useState } from 'react';

import { getAnonId, track } from '../lib/reader/track';
import { supabaseBrowser } from '../lib/supabase/browser';
import { GoldToken, addAward, celebrate } from './Daily';
import { useReader } from './ReaderContext';

/** Tokens for completing it, once. */
export const QUESTIONNAIRE_TOKENS = 10;

const QUESTIONS = [
  { id: 'useful', q: "How useful was today's edition?", opts: [['1', '1 Meh'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5 Love it']] },
  { id: 'trust', q: 'Did you trust the verified facts?', opts: [['2', 'Yes'], ['1', 'Partly'], ['0', 'No']] },
  {
    id: 'price',
    q: 'At £2.50 a month or £25 a year, would you become a member?',
    opts: [['annual', 'Yes, yearly (£25)'], ['monthly', 'Yes, monthly (£2.50)'], ['maybe', 'Maybe'], ['cheaper', 'Only if it were cheaper'], ['free', "No, I'd stick with free"]],
  },
] as const;

const EXTRAS: [string, string][] = [
  ['roundup', 'Your roundup read in full by George and Emma'],
  ['audio', 'Save the audio to listen offline'],
  ['archive', 'Every past edition, with its receipts'],
  ['alerts', 'Alerts on the people and topics you follow'],
  ['puzzles', 'More puzzles, and past ones'],
  ['nosponsor', 'No sponsor messages'],
  ['support', 'Just to support independent fact-checking'],
];

type Answers = { useful: string; trust: string; price: string; extras: string[]; wish: string };
const EMPTY: Answers = { useful: '', trust: '', price: '', extras: [], wish: '' };
const DONE_KEY = 'dr.fb.done';

export function FeedbackForm() {
  const { ed, user } = useReader();
  const uid = useId();
  const key = `dr.fb.${ed.issue}`;
  const [a, setA] = useState<Answers>(EMPTY);
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state after hydration
      setDone(localStorage.getItem(DONE_KEY) === '1');
      if (saved) {
        setA({ ...EMPTY, ...saved, extras: Array.isArray(saved.extras) ? saved.extras : [] });
        setSent(!!saved.price);
      }
    } catch {
      // fine
    }
  }, [key]);

  const db = supabaseBrowser();
  if (!db || ed.id === null) return null;

  const toggleExtra = (k: string) => setA((x) => ({ ...x, extras: x.extras.includes(k) ? x.extras.filter((e) => e !== k) : [...x.extras, k] }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!a.useful || !a.price) {
      setNote('Answer the first question and the membership one, please.');
      return;
    }
    setBusy(true);
    setNote('Saving…');
    const { data, error } = await db.rpc('dr_send_questionnaire', {
      p_anon_id: getAnonId(),
      p_edition_id: ed.id,
      p_useful: Number(a.useful),
      p_trust: a.trust === '' ? null : Number(a.trust),
      p_price: a.price,
      p_extras: a.extras.length ? a.extras : null,
      p_wish: a.wish.slice(0, 1000),
    });
    setBusy(false);
    if (error) {
      setNote("Couldn't save just now. Try again in a moment.");
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(a));
    } catch {
      // fine
    }
    track('feedback', { useful: Number(a.useful), price: a.price, extras: a.extras.length, update: sent });
    setSent(true);
    setNote('Saved. Thank you.');
    // the tokens, the first time: from the account when signed in, on this browser until then
    const awarded = (data as { awarded?: number } | null)?.awarded ?? 0;
    const first = user ? awarded > 0 : !done;
    if (first) {
      try {
        localStorage.setItem(DONE_KEY, '1');
      } catch {
        // fine
      }
      setDone(true);
      addAward('questionnaire', QUESTIONNAIRE_TOKENS);
      celebrate([{ reason: 'questionnaire', amount: QUESTIONNAIRE_TOKENS }]);
    }
  };

  return (
    <section className="feedback" id="feedback" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>Tell us what you think</h2>
      <div className="fbintro">
        <p>
          Daily Receipts is <b>free while we test it</b>. When we launch properly, the daily edition stays free, and a membership of
          about <b>£2.50 a month or £25 a year</b> adds extras. Your answers decide what goes in it.
        </p>
        {!done && (
          <p className="fbprize"><GoldToken size={18} /> Answer once and win <b>{QUESTIONNAIRE_TOKENS} gold DR tokens</b>{user ? '' : '. Sign up to keep them on your account'}.</p>
        )}
      </div>
      <p className="muted">{sent ? 'Thanks, your answers for today are saved. Change them any time.' : 'A few quick taps. Under a minute.'}</p>
      <form onSubmit={submit} noValidate>
        {QUESTIONS.map((f) => (
          <fieldset className="fbq" key={f.id}>
            <legend>{f.q}</legend>
            <div className="fbopts">
              {f.opts.map(([v, l]) => (
                <label key={v} htmlFor={`${uid}-${f.id}-${v}`}>
                  <input type="radio" id={`${uid}-${f.id}-${v}`} name={`${uid}-${f.id}`} value={v} checked={a[f.id] === v} onChange={() => setA((x) => ({ ...x, [f.id]: v }))} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <fieldset className="fbq">
          <legend>Which extras would you most want? Pick any.</legend>
          <div className="fbopts fbmulti">
            {EXTRAS.map(([v, l]) => (
              <label key={v} htmlFor={`${uid}-x-${v}`}>
                <input type="checkbox" id={`${uid}-x-${v}`} checked={a.extras.includes(v)} onChange={() => toggleExtra(v)} />
                <span>{l}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="fbq">
          <legend><label htmlFor={`${uid}-wish`}>What would make you open it every day? (optional)</label></legend>
          <textarea id={`${uid}-wish`} rows={2} maxLength={1000} value={a.wish} onChange={(e) => setA((x) => ({ ...x, wish: e.target.value }))} />
        </fieldset>
        <div className="fbfoot">
          <button className="pill solid" type="submit" disabled={busy}>{sent ? 'Update my answers' : done ? 'Send' : `Send and win ${QUESTIONNAIRE_TOKENS} tokens`}</button>
          {note && <span className="muted" role="status">{note}</span>}
        </div>
      </form>
    </section>
  );
}
