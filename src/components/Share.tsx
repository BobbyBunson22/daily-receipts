'use client';
/**
 * Share a story: the phone's share sheet where there is one (WhatsApp, Messages, Mail...),
 * otherwise the link is copied. The link opens the full receipt and previews as a branded card.
 */
import { shareText, storyUrl } from '../lib/reader/share';
import { track } from '../lib/reader/track';
import type { ClientStory } from '../lib/reader/types';
import { useReader } from './ReaderContext';

export function ShareIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M12 14.5V3.5M7.5 7.5L12 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older browsers: copy through a hidden box
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(box);
    box.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    box.remove();
    return ok;
  }
}

export function useShare() {
  const { toast } = useReader();
  return async (s: ClientStory, from: string) => {
    const url = storyUrl(s, location.origin);
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
    const data = { title: s.head, text: shareText(s), url };
    if (nav.share && (!nav.canShare || nav.canShare(data))) {
      try {
        await nav.share(data);
        track('share', { what: 'story', via: 'sheet', from }, s.id);
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') {
          if (await copy(url)) toast('Link copied. Paste it anywhere');
        }
      }
      return;
    }
    if (await copy(url)) {
      toast('Link copied. Paste it anywhere');
      track('share', { what: 'story', via: 'copy', from }, s.id);
    } else toast(url);
  };
}

/** A round share button, to sit with the other story buttons. */
export function ShareButton({ s, from, className = 'rb share', label }: { s: ClientStory; from: string; className?: string; label?: string }) {
  const share = useShare();
  return (
    <button className={className} data-nodrag onClick={(e) => { e.stopPropagation(); void share(s, from); }} aria-label={label ? undefined : `Share: ${s.head}`}>
      <ShareIcon />{label}
    </button>
  );
}
