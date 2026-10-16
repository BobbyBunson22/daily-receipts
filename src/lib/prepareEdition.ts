/**
 * Small, safe clean-ups applied to an edition before it is validated and stored.
 * Nothing here changes what a story says: only how a link is written.
 */
import type { Edition } from '../types/edition';

export interface Prepared {
  edition: Edition;
  /** What was changed, for the job log. */
  notes: string[];
}

export function prepareEdition(input: Edition): Prepared {
  const edition = structuredClone(input);
  const notes: string[] = [];
  for (const story of edition.stories ?? []) {
    for (const src of story.src ?? []) {
      // Most outlets serve the same page over https; the database only accepts https links.
      if (typeof src[1] === 'string' && src[1].startsWith('http://')) {
        notes.push(`${story.id}: upgraded ${src[1]} to https`);
        src[1] = 'https://' + src[1].slice('http://'.length);
      }
    }
    // "Also reported by" links are optional extras: drop any that couldn't be shown, rather than
    // holding up the edition. Keep one per outlet, skip outlets already among the sources, at most 8.
    if (story.also !== undefined) {
      const inSrc = new Set((story.src ?? []).map((x) => x[0]));
      const seen = new Set<string>();
      const kept: [string, string][] = [];
      for (const a of Array.isArray(story.also) ? story.also : []) {
        const [key, url0] = Array.isArray(a) ? a : [];
        const url = typeof url0 === 'string' && url0.startsWith('http://') ? 'https://' + url0.slice(7) : url0;
        const ok = typeof key === 'string' && !!edition.outlets?.[key] && typeof url === 'string' && /^https:\/\/[^\s]+$/.test(url);
        if (!ok || inSrc.has(key) || seen.has(key) || kept.length >= 8) {
          notes.push(`${story.id}: dropped also link ${JSON.stringify(a)}`);
          continue;
        }
        seen.add(key);
        kept.push([key, url]);
      }
      story.also = kept;
    }
  }
  return { edition, notes };
}
