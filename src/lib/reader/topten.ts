/**
 * Today's top 10: the same ten stories for every reader.
 *
 * "Most important" means most widely covered in the world's press that day: the number of
 * different outlets that ran the story (the sources we checked plus the outlets listed under
 * "Also reported by"). Ties go to the story covered from more countries, then to the higher
 * computed score, then to edition order. Readers' topics, swipes and grade filter play no part.
 *
 * The top 10 is shown first as its own receipt; each reader's personal deck then starts after it
 * and never repeats these stories.
 *
 * Free of React and Next, so a native app can reuse it.
 */
import type { ClientEdition, ClientStory } from './types';

export const TOP_TEN = 10;

/** Distinct outlets that ran this story today. */
export function coverage(s: Pick<ClientStory, 'src' | 'also'>): number {
  return new Set([...s.src.map((x) => x.key), ...(s.also ?? []).map((x) => x.key)]).size;
}

/** Distinct countries those outlets come from (outlets with no country are left out). */
export function countries(s: Pick<ClientStory, 'src' | 'also'>): number {
  const c = new Set<string>();
  for (const x of [...s.src, ...(s.also ?? [])]) if (x.country) c.add(x.country);
  return c.size;
}

const byCoverage = (a: ClientStory, b: ClientStory) =>
  coverage(b) - coverage(a) || countries(b) - countries(a) || b.score - a.score || a.id - b.id;

const cache = new WeakMap<ClientEdition, ClientStory[]>();

/** The day's ten most widely covered stories, most covered first. Same for everyone. */
export function topTen(ed: ClientEdition): ClientStory[] {
  let t = cache.get(ed);
  if (!t) {
    t = [...ed.stories].sort(byCoverage).slice(0, TOP_TEN);
    cache.set(ed, t);
  }
  return t;
}

export const topTenIds = (ed: ClientEdition) => new Set(topTen(ed).map((s) => s.id));
