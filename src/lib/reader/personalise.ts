/**
 * Ordering and filtering, ported from the prototype (docs/ARCHITECTURE.md, Personalisation).
 *   forYou(story) = importance + 6 × affinity + 0.8 × (10 − rank of its section in the reader's order)
 *   affinity = taste[sec] + 0.5 × taste[sec/sub]
 */
import { GRADE_ORDER } from '../grading';
import type { ClientEdition, ClientStory, ReaderState } from './types';

export const SECS_PER_STORY = 12;
export const TOP_N = 8;

export const affSec = (st: ReaderState, sec: string) => st.taste.sec[sec] ?? 0;
export const affinity = (st: ReaderState, s: ClientStory) => affSec(st, s.sec) + 0.5 * (st.taste.sub[`${s.sec}/${s.sub}`] ?? 0);
export const importance = (s: Pick<ClientStory, 'sources' | 'score'>) => s.sources * 10 + s.score / 10;

export function rankOf(st: ReaderState, sec: string): number {
  const i = st.order.indexOf(sec);
  return i < 0 ? 10 : i;
}

export const forYou = (st: ReaderState, s: ClientStory) => importance(s) + affinity(st, s) * 6 + (10 - rankOf(st, s.sec)) * 0.8;

export const passes = (st: ReaderState, s: ClientStory) => GRADE_ORDER.indexOf(s.grade) <= GRADE_ORDER.indexOf(st.min);

/** Stories in the reader's topics that meet their minimum grade. */
export const visible = (st: ReaderState, ed: ClientEdition) => ed.stories.filter((s) => st.order.includes(s.sec) && passes(st, s));

const byForYou = (st: ReaderState) => (a: ClientStory, b: ClientStory) => forYou(st, b) - forYou(st, a) || a.id - b.id;

/** The cards still to swipe, best first. */
export function deckList(st: ReaderState, ed: ClientEdition): ClientStory[] {
  const done = new Set(st.swiped);
  return visible(st, ed).filter((s) => !done.has(s.id)).sort(byForYou(st));
}

export function topStories(st: ReaderState, ed: ClientEdition): ClientStory[] {
  return visible(st, ed).slice().sort(byForYou(st)).slice(0, TOP_N);
}

/** Scroll mode: the rest of each topic, in the reader's order, with how many to show before "more in". */
export function sectionLists(st: ReaderState, ed: ClientEdition, exclude: Set<number>) {
  return st.order
    .map((secId, rank) => {
      const section = ed.sections.find((x) => x.id === secId);
      const list = visible(st, ed).filter((s) => s.sec === secId && !exclude.has(s.id)).sort(byForYou(st));
      const limit = (rank < 3 ? 4 : 2) + Math.max(0, Math.round(affSec(st, secId) / 2));
      return section && list.length ? { section, list, limit } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export const liked = (st: ReaderState, ed: ClientEdition) => ed.stories.filter((s) => st.react[s.id] === 1);

export const minutes = (n: number) => Math.max(1, Math.round((n * SECS_PER_STORY) / 60));

/** Sections the reader leans towards, for the end-of-deck note. */
export function leans(st: ReaderState, ed: ClientEdition): string[] {
  return Object.entries(st.taste.sec)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => ed.sections.find((s) => s.id === k)?.name)
    .filter((x): x is string => !!x);
}
