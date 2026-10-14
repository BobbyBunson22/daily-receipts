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
  }
  return { edition, notes };
}
