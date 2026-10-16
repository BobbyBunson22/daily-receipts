'use client';
import { useEffect, useRef, useState } from 'react';

import { GRADE_LABELS, GRADE_ORDER } from '../lib/grading';
import { TOUR_VERSION } from '../lib/reader/state';
import { Grade, Icon, Logo, shortDate } from './brand';
import { HomeIconArt, InstallButton, offerInstall, useInstallPlatform } from './Install';
import { useReader } from './ReaderContext';

/** The welcome tour: what it is, grades, swiping, roundup, saved, make it yours. */
export function Tour() {
  const { ed, st, update, setOverlay, user } = useReader();
  const [i, setI] = useState(0);
  const platform = useInstallPlatform();
  const x0 = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const steps = [
    { h: "Today's news, with receipts.", p: 'One edition every morning at about 6am. Each story is rebuilt from several outlets, with the opinion, spin and loaded words taken out.',
      art: <div className="ta-logo"><Logo inv /><span className="ta-mono">No. {ed.issue} · {shortDate(ed.date)} · {ed.stories.length} stories</span></div> },
    { h: 'Every story gets a grade', p: 'A to D shows how well the facts are backed up. Tap any card for the receipts: the facts we kept, the claims we cut, every source we checked, and links to other outlets\u2019 coverage.',
      art: <div className="ta-grades">{GRADE_ORDER.map((g) => <div key={g}><Grade grade={g} /><small>{GRADE_LABELS[g].label}</small></div>)}</div> },
    { h: 'Swipe to sort the news', p: 'Right for more like this. Left for less. Up to save it for later without changing your feed. The buttons under the cards do the same.',
      art: <div className="ta-swipe"><span className="ta-arr u">↑ Later</span><span className="ta-arr l">← Less</span><div className="ta-card"><Logo /><i /><i /><i className="s" /></div><span className="ta-arr r">More →</span></div> },
    { h: 'Your roundup, read aloud', p: 'Stories you like go into your roundup. Press play and it reads them out as a short news bulletin.',
      art: <><div className="ta-audio"><span className="ta-play"><Icon.heart /></span><span className="ta-bars">{Array.from({ length: 9 }, (_, k) => <i key={k} />)}</span></div><span className="ta-mono">Your roundup · play bulletin</span></> },
    { h: 'Saved for later', p: "Stories you swipe up stay in your saved list, even after the day's edition changes. Tap Start over any time to see every story again.",
      art: <div className="ta-list"><b>Saved for later</b><span><em>Today</em>3 stories</span><span><em>Yesterday</em>2 stories</span><span><em>Last week</em>5 stories</span></div> },
    { h: 'Four daily puzzles', p: 'A crossword, a sudoku, Rulebook and Sure?, fresh with every edition. The crossword and sudoku get harder as you improve. Switch any of them off in settings.',
      art: <div className="ta-pz"><div className="ta-cw">{'R,E,C,E,I,P,T,#,#,A,#,#,#,#,#,C,#,#,#,#,F,A,C,T,S'.split(',').map((x, k) => (x === '#' ? <i key={k} className="b" /> : <i key={k}>{x}</i>))}</div><div className="ta-su">{'5,3,,6,,9,,9,8'.split(',').map((x, k) => <i key={k}>{x}</i>)}</div></div> },
    ...(offerInstall(platform) ? [{ h: 'Keep it on your home screen', p: platform === 'prompt' || platform === 'android' ? 'Add Daily Receipts to your home screen and it opens full screen with its own icon, like any other app.' : "Add Daily Receipts to your home screen and it opens full screen with its own icon. On iPhone it takes three quick taps; we'll show you.",
      extra: <InstallButton className="pill" from="tour" label={platform === 'prompt' ? 'Add to Home Screen' : 'Show me how'} />,
      art: <HomeIconArt /> }] : []),
    { h: user ? 'Make it yours' : 'Make it yours, free', p: user ? 'Tap the topics you want, then hold and drag to put your favourites first. Your top three get the most stories.' : 'Sign up free with just your email: no password, no card. Your topics, likes and saved stories then follow you to every device.',
      art: <div className="ta-topics">{st.order.slice(0, 4).map((id, k) => <span key={id}><b>{k + 1}</b>{ed.sections.find((s) => s.id === id)?.name}<em className="tgrip"><i /><i /><i /></em></span>)}</div> },
  ];
  const last = i === steps.length - 1;
  const finish = (next: 'start' | 'topics' | 'signup') => {
    update((x) => ({ ...x, toured: TOUR_VERSION }));
    setOverlay(next === 'topics' ? { kind: 'settings' } : next === 'signup' ? { kind: 'account', reason: 'tour' } : null);
  };

  useEffect(() => {
    cardRef.current?.querySelector<HTMLElement>('[data-primary]')?.focus({ preventScroll: true });
  }, [i]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish('start');
      else if (e.key === 'ArrowRight') setI((n) => Math.min(steps.length - 1, n + 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const s = steps[i];
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Welcome to Daily Receipts">
      <div className="tour-card" ref={cardRef}
        onPointerDown={(e) => (x0.current = e.clientX)}
        onPointerUp={(e) => {
          if (x0.current === null) return;
          const dx = e.clientX - x0.current;
          x0.current = null;
          if (Math.abs(dx) > 50) setI((n) => Math.max(0, Math.min(steps.length - 1, n + (dx < 0 ? 1 : -1))));
        }}>
        <button className="tour-skip" onClick={() => finish('start')}>Skip</button>
        <div className="tour-art" aria-hidden="true">{s.art}</div>
        <div className="tour-body">
          <p className="tour-step">{i + 1} of {steps.length}</p>
          <h2>{s.h}</h2>
          <p>{s.p}</p>
          {'extra' in s && s.extra && <div className="tour-extra">{s.extra}</div>}
        </div>
        <div className="tour-foot">
          <div className="tour-dots">
            {steps.map((_, k) => <button key={k} aria-label={`Step ${k + 1}`} aria-current={k === i} onClick={() => setI(k)} />)}
          </div>
          <div className="tour-btns">
            {last && !user ? (
              <>
                <button className="pill" onClick={() => finish('start')}>Not now</button>
                <button className="pill solid" data-primary onClick={() => finish('signup')}>Sign up free</button>
              </>
            ) : last ? (
              <>
                <button className="pill" onClick={() => finish('topics')}>Choose topics</button>
                <button className="pill solid" data-primary onClick={() => finish('start')}>Start swiping</button>
              </>
            ) : (
              <>
                {i > 0 && <button className="pill" onClick={() => setI(i - 1)}>Back</button>}
                <button className="pill solid" data-primary onClick={() => setI(i + 1)}>Next</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
