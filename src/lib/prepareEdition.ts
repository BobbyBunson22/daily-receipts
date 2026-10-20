/**
 * Small, safe clean-ups applied to an edition before it is validated and stored.
 * Nothing here changes what a story says: only how a link is written.
 */
import type { Edition } from '../types/edition';
import { checkSpoken } from './spoken';

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
    // Tags: up to 8 short, distinct names; anything else is dropped rather than failing the edition.
    if (story.tags !== undefined) {
      const seen = new Set<string>();
      story.tags = (Array.isArray(story.tags) ? story.tags : [])
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.replace(/\s+/g, ' ').trim())
        .filter((t) => t.length >= 2 && t.length <= 40 && !seen.has(t.toLowerCase()) && (seen.add(t.toLowerCase()), true))
        .slice(0, 8);
    }
    // Spoken scripts are optional: one that says anything the story doesn't is dropped, and the
    // newsreader reads the written report instead.
    if (story.spoken !== undefined) {
      const problems = checkSpoken(story);
      if (problems.length) {
        notes.push(`${story.id}: dropped spoken script (${problems.slice(0, 3).join('; ')})`);
        delete story.spoken;
      } else story.spoken = story.spoken.map((p) => p.replace(/\s+/g, ' ').trim());
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
