'use client';
import { useEffect, useId, useState } from 'react';

import { getAnonId, track } from '../lib/reader/track';
import { supabaseBrowser } from '../lib/supabase/browser';
import { useReader } from './ReaderContext';

const QUESTIONS = [
  { id: 'useful', q: "How useful was today's edition?", opts: [['1', '1 Meh'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5 Love it']] },
  { id: 'trust', q: 'Did you trust the verified facts?', opts: [['2', 'Yes'], ['1', 'Partly'], ['0', 'No']] },
  { id: 'mode', q: 'Which did you prefer?', opts: [['scroll', 'Scroll'], ['swipe', 'Swipe'], ['both', 'Both']] },
  { id: 'pay', q: 'Would you pay £39 a year (about £3.25 a month) for it?', opts: [['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']] },
] as const;

type Answers = { useful: string; trust: string; mode: string; pay: string; wish: string };
const EMPTY: Answers = { useful: '', trust: '', mode: '', pay: '', wish: '' };

/** Four quick taps, open to everyone. One set of answers per reader per edition; sending again updates it. */
export function FeedbackForm() {
  const { ed } = useReader();
  const uid = useId();
  const key = `dr.fb.${ed.issue}`;
  const [a, setA] = useState<Answers>(EMPTY);
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state after hydration
        setA({ ...EMPTY, ...saved });
        setSent(true);
      }
    } catch {
      // fine
    }
  }, [key]);

  const db = supabaseBrowser();
  if (!db || ed.id === null) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!a.useful || !a.pay) {
      setNote('Answer the first and last questions, please.');
      return;
    }
    setBusy(true);
    setNote('Saving…');
    const { error } = await db.rpc('dr_send_feedback', {
      p_anon_id: getAnonId(),
      p_edition_id: ed.id,
      p_useful: Number(a.useful),
      p_trust: a.trust === '' ? null : Number(a.trust),
      p_mode: a.mode || null,
      p_pay: a.pay,
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
    track('feedback', { useful: Number(a.useful), pay: a.pay, update: sent });
    setSent(true);
    setNote('Saved. Thank you.');
  };

  return (
    <section className="feedback" id="feedback" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>Tell us what you think</h2>
      <p className="muted">{sent ? 'Thanks, your answers for today are saved. Change them any time.' : 'Four quick taps. Under a minute.'}</p>
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
          <legend><label htmlFor={`${uid}-wish`}>What would make you open it every day? (optional)</label></legend>
          <textarea id={`${uid}-wish`} rows={2} maxLength={1000} value={a.wish} onChange={(e) => setA((x) => ({ ...x, wish: e.target.value }))} />
        </fieldset>
        <div className="fbfoot">
          <button className="pill solid" type="submit" disabled={busy}>{sent ? 'Update my answers' : 'Send'}</button>
          {note && <span className="muted" role="status">{note}</span>}
        </div>
      </form>
    </section>
  );
}
