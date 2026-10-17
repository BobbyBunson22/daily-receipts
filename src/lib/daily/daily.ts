/**
 * The daily fact and question: which ones today, checking an answer with room for typos,
 * and the reader's record of answers (one per London day; a correct one wins a gold DR token).
 * Framework-free.
 */
import { rng, seedFrom, shuffled } from '../puzzles/rng';
import { FACTS, QUESTIONS, type DailyQ } from './content';

// ---------------------------------------------------------------- today's pick

/** Days since 1 January 2026 for a London date "YYYY-MM-DD". */
export const dayNumber = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.UTC(2026, 0, 1)) / 86400000);

const factOrder = shuffled(FACTS.map((_, i) => i), rng(seedFrom('dr-daily-facts')));
const qOrder = shuffled(QUESTIONS.map((_, i) => i), rng(seedFrom('dr-daily-questions')));
const at = <T>(list: T[], order: number[], n: number) => list[order[((n % order.length) + order.length) % order.length]];

export const factFor = (day: string) => at(FACTS, factOrder, dayNumber(day));
export const questionFor = (day: string): DailyQ => at(QUESTIONS, qOrder, dayNumber(day));

// ---------------------------------------------------------------- checking an answer

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12',
};

/** Lower case, no accents, no punctuation, no leading "the/a/an", number words as digits. */
export function normalise(s: string): string {
  let t = s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  t = t.replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  t = t.replace(/^(the|a|an) /, '');
  return t.split(' ').map((w) => NUMBER_WORDS[w] ?? w).join(' ');
}

/** Edit distance where swapping two neighbouring letters counts as one slip. */
export function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** Slips allowed for an answer of this length. Numbers and very short answers must be exact. */
const allowed = (ans: string) => (/\d/.test(ans) || ans.length <= 3 ? 0 : ans.length <= 6 ? 1 : ans.length <= 11 ? 2 : 3);

export type Verdict = { ok: true; exact: boolean; answer: string } | { ok: false };

/**
 * Right, allowing for typos: a few slipped letters (fewer for short answers), spaces, accents,
 * capitals and "the". A slip must keep the first letter, and a question's known wrong
 * near-misses (like Austria for Australia) are never accepted.
 */
export function check(input: string, q: DailyQ): Verdict {
  const g = normalise(input);
  if (!g) return { ok: false };
  if ((q.not ?? []).some((n) => normalise(n) === g || normalise(n).replace(/ /g, '') === g.replace(/ /g, ''))) return { ok: false };
  let best: Verdict = { ok: false };
  for (const a of q.a) {
    const n = normalise(a);
    if (g === n || g.replace(/ /g, '') === n.replace(/ /g, '')) return { ok: true, exact: true, answer: q.a[0] };
    if (g[0] !== n[0]) continue;
    const dist = distance(g.replace(/ /g, ''), n.replace(/ /g, ''));
    if (dist <= allowed(n.replace(/ /g, ''))) best = { ok: true, exact: false, answer: q.a[0] };
  }
  return best;
}

// ---------------------------------------------------------------- the reader's record

export type Result = 'correct' | 'wrong' | 'dontknow';

export interface DailyState {
  /** The London day the daily card last opened by itself. */
  seen: string;
  /** London day → how that day's question went. */
  ans: Record<string, Result>;
}

export const DAILY_KEY = 'dr.daily.v1';
export const emptyDaily = (): DailyState => ({ seen: '', ans: {} });

export function normaliseDaily(raw: unknown): DailyState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<DailyState>;
  const ans: Record<string, Result> = {};
  for (const [k, v] of Object.entries(r.ans ?? {}))
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && (v === 'correct' || v === 'wrong' || v === 'dontknow')) ans[k] = v;
  return { seen: typeof r.seen === 'string' ? r.seen : '', ans };
}

/** One answer per day: a second answer for the same day changes nothing. */
export const answer = (st: DailyState, day: string, result: Result): DailyState =>
  st.ans[day] ? st : { ...st, ans: { ...st.ans, [day]: result } };

export const tokens = (st: DailyState) => Object.values(st.ans).filter((r) => r === 'correct').length;

/** Days in a row, up to today, with a correct answer. */
export function goldStreak(st: DailyState, today: string): number {
  let n = 0;
  for (let d = dayNumber(today); ; d--) {
    const day = new Date(Date.UTC(2026, 0, 1) + d * 86400000).toISOString().slice(0, 10);
    if (st.ans[day] === 'correct') n++;
    else if (day !== today) break;
    else if (st.ans[day]) break;
  }
  return n;
}

/** Merge what the account has with what this browser has; the first answer for a day wins. */
export function mergeDaily(local: DailyState, remote: { day: string; result: Result }[]): DailyState {
  const ans = { ...local.ans };
  for (const r of remote) ans[r.day] = r.result;
  return { ...local, ans };
}
