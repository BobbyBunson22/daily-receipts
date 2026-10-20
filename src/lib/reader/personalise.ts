/**
 * What each reader sees, and in what order.
 *
 * - Topics are a hard filter: only the sections a reader picked ever show.
 * - Their order decides the mix: the deck deals from each topic in turn, more often from the
 *   top ones (5, 4, 3, 2, then 1 card per round), so the first choice leads and gets the most.
 * - Within a topic, stories rank by importance and by what the reader has taught the feed
 *   about the story's tags (people, places, organisations, topics), with a little weight on
 *   its sub-section. A swipe teaches about that story, not its whole section.
 * - Stories about things the reader keeps skipping drop to the end of the deck.
 */
import { GRADE_ORDER } from '../grading';
import { tagKey } from './tags';
import type { ClientEdition, ClientStory, ReaderState } from './types';

export const SECS_PER_STORY = 12;
export const TOP_N = 8;
/** At or below this, a story's tags are ones the reader clearly doesn't want: it goes last. */
export const MUTED = -6;

export const importance = (s: Pick<ClientStory, 'sources' | 'score'>) => s.sources * 10 + s.score / 10;

export function rankOf(st: ReaderState, sec: string): number {
  const i = st.order.indexOf(sec);
  return i < 0 ? 10 : i;
}

/** How the reader feels about what this story is about: the sum of its tags' scores, -10 to 10. */
export function tagAffinity(st: ReaderState, s: ClientStory): number {
  let sum = 0;
  for (const t of new Set((s.tags ?? []).map(tagKey))) sum += st.taste.tag[t] ?? 0;
  return Math.max(-10, Math.min(10, sum));
}
export const subAffinity = (st: ReaderState, s: ClientStory) => st.taste.sub[`${s.sec}/${s.sub}`] ?? 0;

/** A story's place within its topic: importance, then what the reader has taught the feed. */
export const storyScore = (st: ReaderState, s: ClientStory) => importance(s) + tagAffinity(st, s) * 3 + subAffinity(st, s);

/** Overall weight, used where topics are mixed without dealing (kept for the end-of-deck note and tests). */
export const forYou = (st: ReaderState, s: ClientStory) => storyScore(st, s) + (10 - rankOf(st, s.sec)) * 3;

export const passes = (st: ReaderState, s: ClientStory) => GRADE_ORDER.indexOf(s.grade) <= GRADE_ORDER.indexOf(st.min);

/** Stories in the reader's topics that meet their minimum grade. */
export const visible = (st: ReaderState, ed: ClientEdition) => ed.stories.filter((s) => st.order.includes(s.sec) && passes(st, s));

const byScore = (st: ReaderState) => (a: ClientStory, b: ClientStory) => storyScore(st, b) - storyScore(st, a) || a.id - b.id;

/** Cards per round for a topic at this place in the reader's order. */
export const dealWeight = (rank: number) => Math.max(1, 5 - rank);

/** Deals stories from each topic in the reader's order, weighted to the top; muted stories last. */
export function arrange(st: ReaderState, stories: ClientStory[]): ClientStory[] {
  const muted = stories.filter((s) => tagAffinity(st, s) <= MUTED).sort(byScore(st));
  const piles = st.order
    .map((sec, rank) => ({ w: dealWeight(rank), credit: 0, list: stories.filter((s) => s.sec === sec && tagAffinity(st, s) > MUTED).sort(byScore(st)) }))
    .filter((p) => p.list.length);
  const out: ClientStory[] = [];
  while (piles.some((p) => p.list.length)) {
    const live = piles.filter((p) => p.list.length);
    const total = live.reduce((t, p) => t + p.w, 0);
    for (const p of live) p.credit += p.w;
    // the pile owed most goes next; ties go to the reader's higher-ranked topic
    const next = live.reduce((a, b) => (b.credit > a.credit ? b : a));
    next.credit -= total;
    out.push(next.list.shift()!);
  }
  return [...out, ...muted];
}

/** Number of receipts: stories in a day's deck. */
export const DECK_SIZES = { quick: 18, standard: 36, long: 54 } as const;
export const deckLimit = (st: ReaderState, ed: ClientEdition) => (st.maxIssue === ed.issue ? Infinity : DECK_SIZES[st.size]);

/**
 * Today's receipts: the stories already swiped, then the best of the rest, up to the reader's
 * number of receipts. Swipes reorder what's left without changing how many there are.
 */
export function todays(st: ReaderState, ed: ClientEdition): ClientStory[] {
  const all = visible(st, ed);
  const done = new Set(st.swiped);
  const swiped = all.filter((s) => done.has(s.id));
  const rest = arrange(st, all.filter((s) => !done.has(s.id)));
  return [...swiped, ...rest.slice(0, Math.max(0, deckLimit(st, ed) - swiped.length))];
}

/** Stories in the reader's topics beyond their number of receipts: what "Maximum receipts" adds. */
export const extraCount = (st: ReaderState, ed: ClientEdition) => visible(st, ed).length - todays(st, ed).length;

/** The cards still to swipe, in order. */
export function deckList(st: ReaderState, ed: ClientEdition): ClientStory[] {
  const done = new Set(st.swiped);
  return todays(st, ed).filter((s) => !done.has(s.id));
}

export function topStories(st: ReaderState, ed: ClientEdition): ClientStory[] {
  return arrange(st, todays(st, ed)).slice(0, TOP_N);
}

/** Scroll mode: the rest of each topic, in the reader's order, with how many to show before "more in". */
export function sectionLists(st: ReaderState, ed: ClientEdition, exclude: Set<number>) {
  return st.order
    .map((secId, rank) => {
      const section = ed.sections.find((x) => x.id === secId);
      const list = todays(st, ed).filter((s) => s.sec === secId && !exclude.has(s.id)).sort(byScore(st));
      const limit = rank < 3 ? 6 : 3;
      return section && list.length ? { section, list, limit } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export const liked = (st: ReaderState, ed: ClientEdition) => ed.stories.filter((s) => st.react[s.id] === 1);

export const minutes = (n: number) => Math.max(1, Math.round((n * SECS_PER_STORY) / 60));

/** The tags in today's edition the reader most wants, as written in the edition. */
export function favouriteTags(st: ReaderState, ed: ClientEdition, n = 3): string[] {
  const names = new Map<string, string>();
  for (const s of ed.stories) for (const t of s.tags ?? []) if (!names.has(tagKey(t))) names.set(tagKey(t), t);
  return Object.entries(st.taste.tag)
    .filter(([k, v]) => v > 0 && names.has(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => names.get(k)!);
}

/** Why a story is near the top, when it's because of what the reader likes. */
export function because(st: ReaderState, s: ClientStory): string {
  let best: [string, number] | null = null;
  for (const t of s.tags ?? []) {
    const v = st.taste.tag[tagKey(t)] ?? 0;
    if (v >= 2 && (!best || v > best[1])) best = [t, v];
  }
  return best ? `Because you like ${best[0]}` : '';
}

/** For the end-of-deck note: what tomorrow leans into. */
export const leans = (st: ReaderState, ed: ClientEdition) => favouriteTags(st, ed);
