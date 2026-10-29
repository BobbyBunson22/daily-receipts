'use client';
/**
 * The focus receipt: one dominating story (today, the Budget) as a short receipt of its headline
 * facts. Every line is a kept fact from one of today's stories, word for word, with its support
 * count; tapping a line opens that story. Pops up once per edition per browser; the strip in the
 * deck and scroll views brings it back.
 */
import { useEffect, useMemo } from 'react';

import { type Focus, focusFor } from '../lib/focus/focus';
import { GRADE_LABELS } from '../lib/grading';
import { Grade, Logo } from './brand';
import { useReader } from './ReaderContext';

const SEEN_KEY = 'dr.focusSeen';

export function useFocus(): Focus | null {
  const { ed } = useReader();
  return useMemo(() => focusFor(ed), [ed]);
}

/** Should today's focus receipt pop up by itself? Once per focus per browser. */
export function focusDue(f: Focus | null): boolean {
  if (!f) return false;
  try {
    return localStorage.getItem(SEEN_KEY) !== f.key;
  } catch {
    return false;
  }
}
export function markFocusSeen(f: Focus) {
  try {
    localStorage.setItem(SEEN_KEY, f.key);
  } catch {
    // private mode: it may pop up again next visit, which is fine
  }
}

/** A slim ticket above the deck and in the scroll intro that reopens the focus receipt. */
export function FocusStrip() {
  const f = useFocus();
  const { setOverlay } = useReader();
  if (!f) return null;
  return (
    <button className="fstrip" onClick={() => setOverlay({ kind: 'focus' })}>
      <span className="fstrip-k">Focus receipt</span>
      <span className="fstrip-t">{f.title}</span>
      <span className="fstrip-n">{f.lines.length} facts →</span>
    </button>
  );
}

export function FocusCard() {
  const f = useFocus();
  const { ed, closeOverlay, openStory } = useReader();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeOverlay();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [closeOverlay]);
  if (!f) return null;
  const day = ed.date.replace(/,? \d{4}$/, '');
  return (
    <div className="focus" role="dialog" aria-modal="true" aria-labelledby="focus-h" onClick={(e) => e.target === e.currentTarget && closeOverlay()}>
      <div className="focus-slip">
        <div className="focus-top">
          <Logo />
          <span className="focus-k">Focus receipt</span>
          <button className="daily-x focus-x" onClick={closeOverlay} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <p className="focus-meta"><span>No. {ed.issue}</span><span>{day}</span></p>
        <h2 id="focus-h" className="focus-h">{f.title}</h2>
        <p className="focus-sub">The headline facts. Each one backed by at least two outlets.</p>
        <ol className="focus-lines">
          {f.lines.map((l, i) => (
            <li key={i} style={{ animationDelay: `${120 + i * 70}ms` }}>
              <button onClick={() => openStory(l.story, 'focus')}
                aria-label={`${l.fact}. ${l.support}. From the story: ${l.story.head}. Grade ${l.story.grade}.`}>
                <span className="focus-tick" aria-hidden="true">✓</span>
                <span className="focus-fact">{l.fact}</span>
                <span className="focus-sup" aria-hidden="true">{l.support.replace(/ outlets?$/, '')}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="focus-total">
          <span>{f.stories.length} stories · {f.outlets} outlets</span>
          <span className="focus-grade" title={GRADE_LABELS[f.floor].note}>{f.floor === 'A' ? 'All graded' : `Graded ${f.floor} or better`} <Grade grade={f.floor} /></span>
        </div>
        <p className="focus-note">Tap a line for its full receipts.</p>
        <div className="focus-foot">
          <button className="pill solid" onClick={closeOverlay}>Got it</button>
        </div>
      </div>
    </div>
  );
}
