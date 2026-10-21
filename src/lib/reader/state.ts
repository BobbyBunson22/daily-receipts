/**
 * A reader's state and every change they can make to it, as pure functions.
 * Stored in the browser for everyone; mirrored to their account when signed in (see sync.ts).
 */
import { tagKey } from './tags';
import { cleanName } from './name';
import type { GradeLetter } from '../../types/edition';
import { GRADE_ORDER } from '../grading';
import type { ClientEdition, ClientStory, DeckSize, Mode, ReaderState, VoiceChoice, SavedEntry, SwipeAction } from './types';

export const STORAGE_KEY = 'dr.web.v1';

const clamp = (x: number) => Math.max(-10, Math.min(10, x));

/**
 * Bump when the welcome tour changes enough that everyone should see it again: every reader
 * whose stored version is lower gets it once on their next visit.
 */
export const TOUR_VERSION = 2;
export const needsTour = (st: ReaderState) => st.toured < TOUR_VERSION;

/** How much one like or skip moves each of the story's tags (scores run from -10 to 10). */
export const TAG_STEP = 2;
const MAX_TAG_KEYS = 300;

/** Keeps the strongest tag scores and drops ones back at zero, so the list stays small. */
export function pruneTags(tag: Record<string, number>): Record<string, number> {
  const entries = Object.entries(tag).filter(([, v]) => v !== 0);
  if (entries.length <= MAX_TAG_KEYS && entries.length === Object.keys(tag).length) return tag;
  return Object.fromEntries(entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, MAX_TAG_KEYS));
}

export function initialState(ed: ClientEdition): ReaderState {
  return {
    v: 1,
    issue: ed.issue,
    order: ed.sections.map((s) => s.id),
    min: 'D',
    mode: 'swipe',
    size: 'standard',
    voice: 'both',
    voicePicked: false,
    name: '',
    secured: '',
    maxIssue: 0,
    taste: { sec: {}, sub: {}, tag: {} },
    react: {},
    swiped: [],
    saves: [],
    toured: 0,
    streak: { last: '', n: 0 },
  };
}

/** Accepts whatever was stored (possibly old or damaged) and returns a valid state for this edition. */
export function normalise(raw: unknown, ed: ClientEdition): ReaderState {
  const base = initialState(ed);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<ReaderState>;
  const known = new Set(ed.sections.map((s) => s.id));
  const sameIssue = r.issue === ed.issue;
  const ids = new Set(ed.stories.map((s) => s.id));
  const num = (o: unknown) =>
    Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, clamp(v as number)]));
  return {
    ...base,
    order: Array.isArray(r.order) ? r.order.filter((id, i, a) => known.has(id) && a.indexOf(id) === i) : base.order,
    min: GRADE_ORDER.includes(r.min as GradeLetter) ? (r.min as GradeLetter) : 'D',
    mode: r.mode === 'scroll' ? 'scroll' : 'swipe',
    size: r.size === 'quick' || r.size === 'long' ? r.size : 'standard',
    // the default (both, taking turns) applies until a reader picks; picks are kept
    voicePicked: r.voicePicked === true,
    name: cleanName(r.name),
    secured: cleanName(r.secured),
    voice: r.voicePicked === true && (r.voice === 'george' || r.voice === 'emma' || r.voice === 'both') ? r.voice : 'both',
    maxIssue: sameIssue && r.maxIssue === ed.issue ? ed.issue : 0,
    taste: { sec: num(r.taste?.sec), sub: num(r.taste?.sub), tag: pruneTags(num(r.taste?.tag)) },
    react: sameIssue && r.react && typeof r.react === 'object'
      ? Object.fromEntries(Object.entries(r.react).filter(([k, v]) => ids.has(Number(k)) && (v === 1 || v === -1)))
      : {},
    swiped: sameIssue && Array.isArray(r.swiped) ? r.swiped.filter((id, i, a) => ids.has(id) && a.indexOf(id) === i) : [],
    saves: Array.isArray(r.saves) ? r.saves.filter((e) => e && typeof e.id === 'number' && e.s && typeof e.s.head === 'string') : [],
    // a stored `true` is from before tours had versions: it counts as version 1
    toured: typeof r.toured === 'number' ? r.toured : r.toured === true ? 1 : 0,
    streak: r.streak && typeof r.streak.last === 'string' && typeof r.streak.n === 'number' ? r.streak : base.streak,
  };
}

/** Counts consecutive days opened; `today` and `yesterday` are London dates as YYYY-MM-DD. */
export function touchStreak(st: ReaderState, today: string, yesterday: string): ReaderState {
  if (st.streak.last === today) return st;
  return { ...st, streak: { last: today, n: st.streak.last === yesterday ? st.streak.n + 1 : 1 } };
}

/** Like (1) or skip (-1) a story; with toggle, doing it again undoes it. Teaches the feed. */
export function react(st: ReaderState, s: ClientStory, v: 1 | -1, toggle = false): ReaderState {
  const prev = st.react[s.id] ?? 0;
  const next = toggle && prev === v ? 0 : v;
  const d = next - prev;
  if (!d) return st;
  const k = `${s.sec}/${s.sub}`;
  const reactMap = { ...st.react };
  if (next) reactMap[s.id] = next as 1 | -1;
  else delete reactMap[s.id];
  // What the story is about learns the most; its sub-section a little; its section not at all
  // (the reader's chosen topics and their order decide the sections).
  const tag = { ...st.taste.tag };
  for (const t of new Set((s.tags ?? []).map(tagKey))) if (t) tag[t] = clamp((tag[t] ?? 0) + TAG_STEP * d);
  return {
    ...st,
    taste: {
      sec: st.taste.sec,
      sub: { ...st.taste.sub, [k]: clamp((st.taste.sub[k] ?? 0) + d) },
      tag: pruneTags(tag),
    },
    react: reactMap,
    // a liked or skipped story leaves the saved list: it has been dealt with
    saves: next ? st.saves.filter((e) => e.id !== s.id) : st.saves,
  };
}

export const isSaved = (st: ReaderState, id: number) => st.saves.some((e) => e.id === id);

export function snapshot(s: ClientStory, ed: ClientEdition, at: number): SavedEntry {
  const secName = ed.sections.find((x) => x.id === s.sec)?.name ?? s.sec;
  return { id: s.id, issue: ed.issue, date: ed.date, at, s: { ...structuredClone(s), clip: null, secName } };
}

export function addSave(st: ReaderState, s: ClientStory, ed: ClientEdition, at: number): ReaderState {
  return isSaved(st, s.id) ? st : { ...st, saves: [...st.saves, snapshot(s, ed, at)] };
}

export const removeSave = (st: ReaderState, id: number): ReaderState => ({ ...st, saves: st.saves.filter((e) => e.id !== id) });

/** One swipe on the deck: more and less teach the feed; later saves without changing it. */
export function swipe(st: ReaderState, s: ClientStory, action: SwipeAction, ed: ClientEdition, at: number): ReaderState {
  const after = action === 'later' ? addSave(st, s, ed, at) : react(st, s, action === 'more' ? 1 : -1);
  return { ...after, swiped: after.swiped.includes(s.id) ? after.swiped : [...after.swiped, s.id] };
}

/** Brings the last card back and undoes what its swipe did. */
export function undo(st: ReaderState, ed: ClientEdition): { state: ReaderState; story: ClientStory | null } {
  const id = st.swiped[st.swiped.length - 1];
  const s = ed.stories.find((x) => x.id === id);
  if (id === undefined || !s) return { state: st, story: null };
  let next: ReaderState = { ...st, swiped: st.swiped.slice(0, -1) };
  const v = st.react[id];
  if (v) next = react(next, s, v, true);
  next = removeSave(next, id);
  return { state: next, story: s };
}

/** Back to story 1. Likes and saves are kept. */
export const restart = (st: ReaderState): ReaderState => ({ ...st, swiped: [] });

/** Puts today's saved stories back in the deck. */
export function reswipeSaved(st: ReaderState, ed: ClientEdition): ReaderState {
  const today = new Set(st.saves.filter((e) => e.issue === ed.issue).map((e) => e.id));
  return { ...st, swiped: st.swiped.filter((id) => !today.has(id)) };
}

export function toggleTopic(st: ReaderState, id: string): ReaderState {
  return { ...st, order: st.order.includes(id) ? st.order.filter((x) => x !== id) : [...st.order, id] };
}

export function moveTopic(st: ReaderState, from: number, to: number): ReaderState {
  if (from === to || to < 0 || to >= st.order.length || from < 0 || from >= st.order.length) return st;
  const order = st.order.slice();
  const [id] = order.splice(from, 1);
  order.splice(to, 0, id);
  return { ...st, order };
}

export const setMin = (st: ReaderState, min: GradeLetter): ReaderState => ({ ...st, min });
export const setMode = (st: ReaderState, mode: Mode): ReaderState => ({ ...st, mode });
export const setSize = (st: ReaderState, size: DeckSize): ReaderState => ({ ...st, size });
export const setName = (st: ReaderState, name: string): ReaderState => ({ ...st, name: cleanName(name) });
export const setVoice = (st: ReaderState, voice: VoiceChoice): ReaderState => ({ ...st, voice, voicePicked: true });
/** Maximum receipts: every story in today's edition, for today only. */
export const showMax = (st: ReaderState, ed: ClientEdition): ReaderState => ({ ...st, maxIssue: ed.issue });
/** Forget one learned tag. */
export function forgetTag(st: ReaderState, key: string): ReaderState {
  const tag = { ...st.taste.tag };
  delete tag[key];
  return { ...st, taste: { ...st.taste, tag } };
}

export const resetTaste = (st: ReaderState): ReaderState => ({ ...st, taste: { sec: {}, sub: {}, tag: {} }, react: {} });

/** Saved entries grouped for display: today's edition first, then by day, newest first. */
export function savedGroups(st: ReaderState, ed: ClientEdition): { label: string; today: boolean; entries: SavedEntry[] }[] {
  const all = st.saves.slice().sort((a, b) => b.at - a.at);
  const isToday = (e: SavedEntry) => e.issue === ed.issue && ed.stories.some((x) => x.id === e.id);
  const groups: { label: string; today: boolean; entries: SavedEntry[] }[] = [];
  const today = all.filter(isToday);
  if (today.length) groups.push({ label: 'Today', today: true, entries: today });
  for (const e of all.filter((x) => !isToday(x))) {
    const g = groups.find((x) => !x.today && x.label === e.date);
    if (g) g.entries.push(e);
    else groups.push({ label: e.date, today: false, entries: [e] });
  }
  return groups;
}
