/**
 * Daily-fresh puzzle material taken from the edition itself. Everything here quotes
 * the edition's own headlines and kept facts word for word, so a puzzle can never
 * show a fact the edition doesn't contain.
 */
import { rng, seedFrom, shuffled } from './rng';

/** Editions from this issue on use the daily-fresh puzzles; earlier ones keep the prototype's. */
export const FRESH_FROM_ISSUE = 11;
export const isFresh = (issue: number) => issue >= FRESH_FROM_ISSUE;

export interface NewsStory { head: string; kept: [string, string][] }

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Days since 1 January 2026 for a date label like "Thursday, 15 October 2026". */
export function dayIndex(date: string): number {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(date);
  if (!m) return seedFrom(date) % 10000;
  const mi = MONTHS.indexOf(m[2].toLowerCase());
  return Math.round((Date.UTC(+m[3], Math.max(0, mi), +m[1]) - Date.UTC(2026, 0, 1)) / 86400000);
}

const STOP = new Set(`about above after again against also amid among around away back been before being below between both came come could does doing done down during each even ever every first from gets give goes going gone have having here into just last later least less like made make many more most much must near never next only onto other over said says same see seen shall should since some still such than that their them then there these they this those through told under until upon very want week were what when where which while who whom whose will with within without would year years your
`.split(/\s+/));

const blank = (text: string, word: string) =>
  text.replace(new RegExp(`\\b${word}\\b`, 'gi'), (m) => '_'.repeat(Math.min(m.length, 3)));

/**
 * Crossword entries from today's headlines: a lower-case word of 4 to `max` letters,
 * clued by its own headline with the word blanked out. One word per headline.
 */
export function newsCrosswordWords(stories: NewsStory[], seed: string, count: number, max: number) {
  const r = rng(seedFrom(`${seed}|news`));
  const out: { w: string; c: string }[] = [];
  const seen = new Set<string>();
  for (const s of shuffled(stories, r)) {
    if (out.length >= count) break;
    const words = (s.head.match(/[A-Za-z]+(?:'[a-z]+)?/g) ?? [])
      .filter((w) => /^[a-z]+$/.test(w) && w.length >= 4 && w.length <= max && !STOP.has(w) && !seen.has(w));
    if (!words.length) continue;
    const w = shuffled(words, r)[0];
    seen.add(w);
    out.push({ w: w.toUpperCase(), c: `In today's news: "${blank(s.head, w)}"` });
  }
  return out;
}

/** Words for Rulebook examples: every distinct word of 3 to 10 letters in today's headlines. */
export function headlineWords(stories: NewsStory[]) {
  const set = new Set<string>();
  for (const s of stories)
    for (const w of s.head.match(/[A-Za-z]+/g) ?? []) {
      const l = w.toLowerCase();
      if (l.length >= 3 && l.length <= 10) set.add(l);
    }
  return [...set];
}

export interface NewsNumber { q: string; x: number; note: string; head: string }

// One number, written plainly (12, 1,413, 5.4, £100 million, 21.7%), nowhere near a date or a clock time.
const NUM = /(?<![\w.\-/£$€])([£$€]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?![\d,]*\d)(?=(%|\s|,(?!\d)|$|\)|;|:))/g;

/**
 * Sure? questions from today's kept facts: a fact with exactly one number, backed by
 * at least two outlets, asked as a fill-the-gap. The number is the fact's own.
 */
export function newsNumbers(stories: NewsStory[], seed: string, count: number): NewsNumber[] {
  const r = rng(seedFrom(`${seed}|sr`));
  const out: NewsNumber[] = [];
  for (const s of shuffled(stories, r)) {
    if (out.length >= count) break;
    const cands = s.kept.filter(([fact, support]) => {
      const n = /^(\d+) of (\d+)/.exec(support);
      if (!n || +n[1] < 2) return false;
      const all = [...fact.matchAll(/\d/g)];
      const hits = [...fact.matchAll(NUM)];
      if (hits.length !== 1) return false;
      const h = hits[0];
      const digits = h[2] + (h[3] ?? '');
      // every digit in the fact must belong to this one number
      if (all.length !== digits.replace(/\D/g, '').length) return false;
      // the headline is shown with the question, so it mustn't give the answer away
      if (s.head.includes(h[2])) return false;
      const v = Number(digits.replace(/,/g, ''));
      if (!Number.isFinite(v) || v === 0) return false;
      if (/^(1[5-9]|20)\d\d$/.test(digits)) return false; // a year
      const before = fact.slice(0, h.index).toLowerCase(), after = fact.slice(h.index! + h[0].length).toLowerCase().trim();
      if (MONTHS.some((m) => after.startsWith(m) || before.trimEnd().endsWith(m))) return false;
      if (/\b(no\.?|number|type|category|class|grade|stage|level|tier|page|section|article|route|flight)\s*$/.test(before)) return false;
      if (/^(am|pm|o'clock|gmt|bst|utc)\b/.test(after)) return false;
      // part of a name, like "Masters 1000" or "Boeing 737"
      if (/\S\s+[A-Z][a-z]*\s*$/.test(fact.slice(0, h.index))) return false;
      return true;
    });
    if (!cands.length) continue;
    const [fact, support] = cands[Math.floor(r() * cands.length)];
    const h = [...fact.matchAll(NUM)][0];
    const x = Number((h[2] + (h[3] ?? '')).replace(/,/g, ''));
    const q = fact.slice(0, h.index! + h[1].length) + '___' + fact.slice(h.index! + h[1].length + h[2].length + (h[3] ?? '').length);
    out.push({ q, x, head: s.head, note: `Checked against ${support} in today's edition.` });
  }
  return out;
}
