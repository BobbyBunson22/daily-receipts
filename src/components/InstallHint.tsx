'use client';
import { useEffect, useState } from 'react';

import { offerInstall, useInstall } from './Install';

const KEY = 'dr.install.dismissed';

/** A tip at the top of the scroll view suggesting the home screen, until the reader hides it. */
export function InstallHint() {
  const { platform, start } = useInstall();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let dismissed = true;
    try {
      dismissed = localStorage.getItem(KEY) === '1';
    } catch {
      // storage blocked: don't nag
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state after hydration
    setHidden(dismissed);
  }, []);

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // fine
    }
  };

  if (hidden || !offerInstall(platform)) return null;
  return (
    <div className="install" role="note">
      <p><b>Make it an app:</b> add Daily Receipts to your home screen. It opens full screen with its own icon.</p>
      <button className="rpill" onClick={() => start('hint')}>{platform === 'prompt' ? 'Add' : 'Show me how'}</button>
      <button className="x" onClick={dismiss} aria-label="Hide this tip">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}
