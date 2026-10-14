'use client';
/**
 * Usage events for the beta dashboard. Batched, sent quietly, never blocking the reader.
 * No personal details: a random id per browser, plus the account id when signed in
 * (the database adds that itself).
 */
import { supabaseBrowser } from '../supabase/browser';

export type EventName =
  | 'open' | 'swipe' | 'deck_done' | 'restart' | 'story_open' | 'source_click'
  | 'roundup_open' | 'roundup_play' | 'roundup_done' | 'save' | 'unsave'
  | 'mode' | 'settings' | 'signup_start' | 'signin' | 'signout' | 'feedback'
  | 'install' | 'share';

const ANON_KEY = 'dr.anon';
let anonId = '';

/** A random id for this browser, kept in local storage. */
export function getAnonId(): string {
  if (anonId) return anonId;
  try {
    anonId = localStorage.getItem(ANON_KEY) ?? '';
  } catch {
    // storage blocked: use a per-visit id
  }
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(anonId)) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    anonId = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
    try {
      localStorage.setItem(ANON_KEY, anonId);
    } catch {
      // fine
    }
  }
  return anonId;
}

interface Pending {
  name: EventName;
  edition_id: number | null;
  story_id: number | null;
  props: Record<string, unknown>;
}

let queue: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let editionId: number | null = null;

export function setTrackingEdition(id: number | null) {
  editionId = id;
}

async function flush() {
  timer = null;
  const db = supabaseBrowser();
  if (!db || !queue.length) {
    queue = [];
    return;
  }
  const batch = queue.splice(0, 50).map((e) => ({ ...e, anon_id: getAnonId() }));
  const { error } = await db.from('events').insert(batch);
  if (error && process.env.NODE_ENV !== 'production') console.warn('events', error.message);
  if (queue.length) timer = setTimeout(flush, 500);
}

export function track(name: EventName, props: Record<string, unknown> = {}, storyId: number | null = null) {
  if (editionId === null) return; // local preview: nothing to record against
  queue.push({ name, edition_id: editionId, story_id: storyId, props });
  if (!timer) timer = setTimeout(flush, 2000);
}

if (typeof window !== 'undefined') {
  // send what's waiting when the reader leaves or switches app
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && queue.length) void flush();
  });
}
