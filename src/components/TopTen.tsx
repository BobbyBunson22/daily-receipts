'use client';
/**
 * Today's top 10, the same for everyone, then a quick check of the reader's own options.
 *
 * After the daily fact and question, the top 10 pops up as one receipt: the day's most widely
 * covered stories, each line a headline from the edition with its computed grade and how many
 * outlets ran it. Tapping a line opens the full receipts; the heart adds it to the roundup.
 * Closing it brings up "Your receipts": topics, number of receipts and lowest grade, with one tap
 * to carry on into the personal deck. Both pop up once per edition per browser; the strip above
 * the deck brings the top 10 back.
 */
import { useEffect } from 'react';

import { deckList, todays } from '../lib/reader/personalise';
import { setMin, setSize } from '../lib/reader/state';
import { coverage, topTen } from '../lib/reader/topten';
import type { ClientEdition } from '../lib/reader/types';
import { Grade, Icon, Logo } from './brand';
import { useReader } from './ReaderContext';
import { TopicOrder } from './Sheets';

const TOP_KEY = 'dr.topTenSeen';
const YOURS_KEY = 'dr.yoursSeen';

const seen = (k: string, issue: number) => {
  try {
    return localStorage.getItem(k) === String(issue);
  } catch {
    return true; // private mode: don't keep popping up
  }
};
const mark = (k: string, issue: number) => {
  try {
    localStorage.setItem(k, String(issue));
  } catch {
    // fine
  }
};

export const topTenDue = (ed: ClientEdition) => topTen(ed).length > 0 && !seen(TOP_KEY, ed.issue);
export const markTopTenSeen = (ed: ClientEdition) => mark(TOP_KEY, ed.issue);
export const yoursDue = (ed: ClientEdition) => !seen(YOURS_KEY, ed.issue);
export const markYoursSeen = (ed: ClientEdition) => mark(YOURS_KEY, ed.issue);

function useEscape(fn: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && fn();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [fn]);
}

/** A slim ticket above the deck and in the scroll intro that reopens the top 10. */
export function TopTenStrip() {
  const { ed, setOverlay } = useReader();
  const top = topTen(ed);
  if (!top.length) return null;
  return (
    <button className="fstrip tstrip" onClick={() => setOverlay({ kind: 'top10' })}>
      <span className="fstrip-k">Top {top.length}</span>
      <span className="fstrip-t">Today&apos;s biggest stories</span>
      <span className="fstrip-n">→</span>
    </button>
  );
}

export function TopTenCard() {
  const { ed, st, closeOverlay, openStory, react, setOverlay } = useReader();
  useEscape(closeOverlay);
  const top = topTen(ed);
  const day = ed.date.replace(/,? \d{4}$/, '');
  const next = () => {
    if (!yoursDue(ed)) return setOverlay(null);
    markYoursSeen(ed);
    setOverlay({ kind: 'yours' });
  };
  return (
    <div className="focus" role="dialog" aria-modal="true" aria-labelledby="top10-h" onClick={(e) => e.target === e.currentTarget && next()}>
      <div className="focus-slip">
        <div className="focus-top">
          <Logo />
          <span className="focus-k">Today&apos;s top {top.length}</span>
          <button className="daily-x focus-x" onClick={next} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <p className="focus-meta"><span>No. {ed.issue}</span><span>{day}</span></p>
        <h2 id="top10-h" className="focus-h">The top {top.length}</h2>
        <p className="focus-sub">The stories the most outlets covered today. Same for everyone.</p>
        <ol className="focus-lines top10-lines">
          {top.map((s, i) => {
            const n = coverage(s);
            const on = st.react[s.id] === 1;
            return (
              <li key={s.id} style={{ animationDelay: `${120 + i * 60}ms` }}>
                <button className="t10-open" onClick={() => openStory(s, 'top10')}
                  aria-label={`${i + 1}. ${s.head}. Covered by ${n} outlets. Grade ${s.grade}.`}>
                  <span className="t10-n" aria-hidden="true">{i + 1}</span>
                  <span className="t10-h">{s.head}</span>
                  <span className="t10-meta" aria-hidden="true"><Grade grade={s.grade} /><span>{n} outlets</span></span>
                </button>
                <button className={`t10-love${on ? ' on' : ''}`} onClick={() => react(s, 1)} aria-pressed={on}
                  aria-label={on ? `Remove from your roundup: ${s.head}` : `Add to your roundup: ${s.head}`}><Icon.heart /></button>
              </li>
            );
          })}
        </ol>
        <p className="focus-note">Tap a story for its full receipts. The heart adds it to your roundup.</p>
        <div className="focus-foot">
          <button className="pill solid" onClick={next}>Now for your receipts →</button>
        </div>
      </div>
    </div>
  );
}

export function YoursCard() {
  const { ed, st, update, closeOverlay } = useReader();
  useEscape(closeOverlay);
  const n = todays(st, ed).length;
  const left = deckList(st, ed).length;
  return (
    <div className="focus" role="dialog" aria-modal="true" aria-labelledby="yours-h" onClick={(e) => e.target === e.currentTarget && closeOverlay()}>
      <div className="focus-slip yours">
        <div className="focus-top">
          <Logo />
          <span className="focus-k">Your receipts</span>
          <button className="daily-x focus-x" onClick={closeOverlay} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <h2 id="yours-h" className="focus-h">Now, your receipts</h2>
        <p className="focus-sub">Picked from your topics, in your order. All happy with these?</p>
        <div className="yours-body">
          <TopicOrder />
          <h4>Number of receipts</h4>
          <div className="addrow" role="group" aria-label="Number of receipts">
            {([['quick', 'Quick', 18], ['standard', 'Standard', 36], ['long', 'Long', 54]] as const).map(([k, t, c]) => (
              <button key={k} className="pill" aria-pressed={st.size === k} onClick={() => update((x) => setSize(x, k))}>{t} · {c}</button>
            ))}
          </div>
          <h4>Lowest grade to show</h4>
          <div className="addrow" role="group" aria-label="Lowest grade to show">
            {([['A', 'A only'], ['B', 'A–B'], ['C', 'A–C'], ['D', 'All grades']] as const).map(([g, t]) => (
              <button key={g} className="pill" aria-pressed={st.min === g} onClick={() => update((x) => setMin(x, g))}>{t}</button>
            ))}
          </div>
        </div>
        <div className="focus-foot">
          <button className="pill solid" onClick={closeOverlay} disabled={!st.order.length}>
            {!st.order.length ? 'Pick a topic first' : left < n ? `Carry on · ${left} left` : `Looks good · ${n} receipts`}
          </button>
        </div>
      </div>
    </div>
  );
}
