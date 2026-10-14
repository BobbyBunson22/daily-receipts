'use client';
import { useEffect, useState } from 'react';

import { track } from '../lib/reader/track';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const KEY = 'dr.install.dismissed';

/** Suggests adding the app to the home screen on phones, once the reader has come back. */
export function InstallHint() {
  const [show, setShow] = useState<null | 'ios' | 'prompt'>(null);
  const [evt, setEvt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === '1';
    } catch {
      dismissed = true;
    }
    if (standalone || dismissed || !matchMedia('(pointer: coarse)').matches) return;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state after hydration
    if (ios) setShow('ios');
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallPrompt);
      setShow('prompt');
    };
    addEventListener('beforeinstallprompt', onPrompt);
    return () => removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    setShow(null);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // fine
    }
  };

  if (!show) return null;
  return (
    <div className="install" role="note">
      {show === 'ios' ? (
        <p><b>Make it an app:</b> tap Share, then &ldquo;Add to Home Screen&rdquo;. It opens full screen, like any other app.</p>
      ) : (
        <>
          <p><b>Make it an app:</b> add Daily Receipts to your home screen.</p>
          <button className="rpill" onClick={async () => {
            if (!evt) return;
            await evt.prompt();
            const { outcome } = await evt.userChoice;
            track('install', { outcome });
            dismiss();
          }}>Add</button>
        </>
      )}
      <button className="x" onClick={dismiss} aria-label="Hide this tip">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}
