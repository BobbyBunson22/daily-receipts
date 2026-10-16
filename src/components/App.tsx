'use client';
import Link from 'next/link';
import { useEffect } from 'react';

import { deckList, visible } from '../lib/reader/personalise';
import { needsTour } from '../lib/reader/state';
import { track } from '../lib/reader/track';
import type { ClientEdition } from '../lib/reader/types';
import { Icon, Logo } from './brand';
import { GameSheet, PuzzleProvider, PuzzlesSheet } from './Puzzles';
import { ReaderProvider, useReader } from './ReaderContext';
import { ScrollView } from './ScrollView';
import { AccountSheet, RoundupSheet, SavedSheet, SettingsSheet, StorySheet } from './Sheets';
import { SwipeView } from './SwipeView';
import { InstallSheet } from './Install';
import { Tour } from './Tour';

function Header() {
  const { ed, st, update, setOverlay, user } = useReader();
  const all = visible(st, ed).length;
  const progress = st.mode === 'swipe' && all ? (all - deckList(st, ed).length) / all : 0;
  const setMode = (mode: 'swipe' | 'scroll') => {
    if (st.mode === mode) return;
    update((x) => ({ ...x, mode }));
    track('mode', { mode });
    scrollTo(0, 0);
  };
  const initial = (user?.email ?? '?').trim()[0]?.toUpperCase() ?? '?';
  return (
    <header className="top">
      <div className="top-in">
        <Link className="brand" href="/" aria-label="Daily Receipts, today's edition"><Logo inv /><span className="word">Daily Receipts</span></Link>
        <div className="modes" role="group" aria-label="View">
          <button aria-pressed={st.mode === 'swipe'} onClick={() => setMode('swipe')}>Swipe</button>
          <button aria-pressed={st.mode === 'scroll'} onClick={() => setMode('scroll')}>Scroll</button>
        </div>
        {user ? (
          <button className="acct in" onClick={() => setOverlay({ kind: 'settings' })} aria-label={`Your account and settings (signed in as ${user.email ?? 'you'})`}>{initial}</button>
        ) : (
          <button className="acct" onClick={() => setOverlay({ kind: 'account', reason: 'header' })}>Sign up</button>
        )}
        <button className="icon-btn" onClick={() => setOverlay({ kind: 'settings' })} aria-label="Your topics and settings"><Icon.settings /></button>
      </div>
      <div className="progress" aria-hidden="true"><i style={{ width: `${(progress * 100).toFixed(1)}%` }} /></div>
    </header>
  );
}

function Overlays() {
  const { overlay } = useReader();
  if (!overlay) return null;
  switch (overlay.kind) {
    case 'story': return <StorySheet id={overlay.id} />;
    case 'roundup': return <RoundupSheet />;
    case 'saved': return <SavedSheet />;
    case 'settings': return <SettingsSheet />;
    case 'account': return <AccountSheet reason={overlay.reason} />;
    case 'tour': return <Tour />;
    case 'install': return <InstallSheet />;
    case 'puzzles': return <PuzzlesSheet />;
    case 'game': return <GameSheet key={overlay.game} game={overlay.game} />;
  }
}

function Body() {
  const { st, ready, toastMsg, overlay, setOverlay } = useReader();
  useEffect(() => {
    if (ready && needsTour(st) && !overlay) {
      const t = setTimeout(() => setOverlay({ kind: 'tour' }), 500);
      return () => clearTimeout(t);
    }
  }, [ready, st, overlay, setOverlay]);
  return (
    <>
      <a className="skip" href="#app">Skip to the stories</a>
      <Header />
      <main id="app" tabIndex={-1}>
        <div className="wrap">{st.mode === 'swipe' ? <SwipeView /> : <ScrollView />}</div>
      </main>
      <Overlays />
      <div className={`toast${toastMsg ? ' on' : ''}`} role="status" aria-live="polite">{toastMsg}</div>
    </>
  );
}

export function App({ edition }: { edition: ClientEdition }) {
  return (
    <ReaderProvider ed={edition}>
      <PuzzleProvider>
        <Body />
      </PuzzleProvider>
    </ReaderProvider>
  );
}
