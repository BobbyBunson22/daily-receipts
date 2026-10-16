'use client';
/**
 * "Add to Home Screen". Where the browser allows it (Chrome and Edge on Android and desktop),
 * one tap shows the browser's own install prompt. iPhone and iPad don't let a website install
 * itself, so there the button opens a short picture guide to Safari's Share → Add to Home Screen.
 */
import { useSyncExternalStore } from 'react';

import { track } from '../lib/reader/track';
import { Logo } from './brand';
import { useReader } from './ReaderContext';
import { Sheet } from './Sheets';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type Platform = 'installed' | 'prompt' | 'ios-safari' | 'ios-other' | 'inapp' | 'android' | 'desktop';

// The browser fires beforeinstallprompt once, early, so listen from the moment this module loads.
let deferred: InstallPrompt | null = null;
let installed = false;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());
if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    ping();
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    track('install', { outcome: 'installed' });
    ping();
  });
}

function detect(): Platform {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (installed || nav.standalone === true || matchMedia('(display-mode: standalone)').matches) return 'installed';
  if (deferred) return 'prompt';
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (/FBAN|FBAV|Instagram|LinkedInApp|Snapchat|TikTok|Twitter|Line\//.test(ua)) return 'inapp';
  if (ios) return /CriOS|FxiOS|EdgiOS|GSA\//.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** Which install route this browser offers; null until the page has loaded in the browser. */
export function useInstallPlatform(): Platform | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    detect,
    () => null,
  );
}

/** Worth offering here: a phone or tablet, or any browser with a real install prompt. */
export const offerInstall = (p: Platform | null) => !!p && p !== 'installed' && p !== 'desktop';

/** One tap: the browser's install prompt where there is one, otherwise the guide. */
export function useInstall() {
  const platform = useInstallPlatform();
  const { setOverlay } = useReader();
  const start = async (from: string) => {
    if (deferred) {
      const e = deferred;
      await e.prompt();
      const { outcome } = await e.userChoice;
      track('install', { outcome, from });
      deferred = null;
      ping();
    } else {
      track('install', { outcome: 'guide', platform, from });
      setOverlay({ kind: 'install' });
    }
  };
  return { platform, start };
}

/** A button for anywhere in the app; hidden once the app is on the home screen. */
export function InstallButton({ className = 'pill', from, label = 'Add to Home Screen' }: { className?: string; from: string; label?: string }) {
  const { platform, start } = useInstall();
  if (!offerInstall(platform)) return null;
  return <button className={className} onClick={() => start(from)}>{label}</button>;
}

// ---------------------------------------------------------------- the guide

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M7 10H5v10h14V10h-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
);
const AddIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);
const Key = ({ children }: { children: React.ReactNode }) => <span className="ikey">{children}</span>;

/** The steps for this phone, as a numbered list. */
export function InstallSteps({ platform }: { platform: Platform | null }) {
  const steps: React.ReactNode[] =
    platform === 'ios-safari' ? [
      <>Tap <Key><ShareIcon /> Share</Key> at the bottom of Safari (top right on iPad). Can&apos;t see it? Tap <Key>•••</Key> first.</>,
      <>Scroll down and tap <Key><AddIcon /> Add to Home Screen</Key>.</>,
      <>Tap <Key>Add</Key>. The Daily Receipts icon appears on your home screen.</>,
    ] : platform === 'ios-other' ? [
      <>Tap <Key><ShareIcon /> Share</Key> in the address bar or menu.</>,
      <>Tap <Key><AddIcon /> Add to Home Screen</Key>.</>,
      <>Not there? Open dailyreceipts.com in Safari and do the same.</>,
    ] : platform === 'inapp' ? [
      <>You&apos;re in another app&apos;s browser. Tap <Key>•••</Key> and choose <Key>Open in browser</Key> (or Open in Safari).</>,
      <>Then tap <Key><ShareIcon /> Share</Key> and <Key><AddIcon /> Add to Home Screen</Key> on iPhone, or the menu <Key>⋮</Key> and <Key>Install app</Key> on Android.</>,
    ] : platform === 'android' ? [
      <>Tap the menu <Key>⋮</Key> at the top right of your browser.</>,
      <>Tap <Key>Install app</Key> or <Key>Add to Home screen</Key>.</>,
      <>Tap <Key>Install</Key>. The Daily Receipts icon appears with your apps.</>,
    ] : [
      <>In Chrome or Edge, click the install icon at the right of the address bar.</>,
      <>In Safari on a Mac, choose <Key>File</Key> then <Key>Add to Dock</Key>.</>,
    ];
  return <ol className="isteps">{steps.map((s, k) => <li key={k}><span>{k + 1}</span><p>{s}</p></li>)}</ol>;
}

/** What it looks like once added: the icon on a home screen. */
export function HomeIconArt() {
  return (
    <div className="ta-home">
      {Array.from({ length: 3 }, (_, k) => <i key={k} />)}
      <div className="ta-app"><span><Logo inv /></span><small>Receipts</small></div>
      {Array.from({ length: 4 }, (_, k) => <i key={`b${k}`} />)}
    </div>
  );
}

export function InstallSheet() {
  const platform = useInstallPlatform();
  return (
    <Sheet label="Add to Home Screen">
      <h2 className="sh-title">Add Daily Receipts to your home screen</h2>
      <p className="stand">It opens full screen with its own icon, like any other app. Free, and nothing to download from the App Store.</p>
      {platform === 'installed' ? <p>You&apos;re all set: Daily Receipts is already on your home screen.</p> : <InstallSteps platform={platform} />}
      {(platform === 'ios-safari' || platform === 'ios-other') && (
        <p className="muted">iPhone doesn&apos;t let websites add themselves, so it takes these taps. You only do it once.</p>
      )}
    </Sheet>
  );
}
