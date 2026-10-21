/**
 * Sharing a story: its own link (/s/<id>-<words from the headline>), which opens the full receipt
 * and shows a branded preview with the headline wherever it's pasted. Framework-free.
 */
import { SITE_URL } from '../site';
import type { ClientStory } from './types';

/** "Bus passengers could face £100 fines" -> "bus-passengers-could-face-100-fines" (at most 8 words). */
export const headSlug = (head: string) =>
  head.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 8).join('-');

export const storyPath = (s: Pick<ClientStory, 'id' | 'head'>) => `/s/${s.id}${headSlug(s.head) ? `-${headSlug(s.head)}` : ''}`;
export const storyUrl = (s: Pick<ClientStory, 'id' | 'head'>, base = SITE_URL) => base.replace(/\/$/, '') + storyPath(s);

/** The story id from a shared path segment, e.g. "285-trump-announces" -> 285. */
export const storyIdFrom = (segment: string) => {
  const m = /^(\d{1,12})(?:-|$)/.exec(segment);
  return m ? Number(m[1]) : null;
};

/** What goes with the link in a message: the headline and its grade. */
export const shareText = (s: Pick<ClientStory, 'head' | 'grade' | 'kept'>) =>
  `${s.head} (Grade ${s.grade}, ${s.kept.length} facts checked) via Daily Receipts`;
