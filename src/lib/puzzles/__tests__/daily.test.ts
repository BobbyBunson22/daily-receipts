/** Daily-fresh puzzles (from issue 11): built from the real editions in data/, they quote the
 *  edition word for word, change every day, and don't repeat bank material for weeks. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CW_BANK_ALL, CW_LEVELS, cwCells, makeCrossword } from '../crossword';
import { FRESH_FROM_ISSUE, dayIndex, headlineWords, isFresh, newsCrosswordWords, newsNumbers, type NewsStory } from '../daily';
import { RB_RULES, makeRulebookDaily } from '../rulebook';
import { SR_BANK, SR_N, SR_Q, srSet, sureQuestions } from '../sure';

interface Ed { edition: { issue: number; date: string }; stories: NewsStory[] }
const load = (f: string) => JSON.parse(readFileSync(join(__dirname, '../../../../data', f), 'utf8')) as Ed;
const eds = ['edition-2026-10-07.json', 'edition-2026-10-12.json', 'edition-2026-10-15.json'].map(load);
const asFresh = (e: Ed, issue: number) => ({ issue, date: e.edition.date, stories: e.stories });

describe('daily helpers', () => {
  it('counts days from the date label', () => {
    expect(dayIndex('Thursday, 15 October 2026')).toBe(287);
    expect(dayIndex('Friday, 16 October 2026')).toBe(288);
    expect(dayIndex('Thursday, 1 January 2026')).toBe(0);
  });
  it('fresh puzzles start at issue 11', () => {
    expect(FRESH_FROM_ISSUE).toBe(11);
    expect(isFresh(10)).toBe(false);
    expect(isFresh(11)).toBe(true);
  });
});

describe('crossword from the news', () => {
  it('headline words are clued by their own headline, with only that word blanked', () => {
    for (const e of eds) {
      const ws = newsCrosswordWords(e.stories, e.edition.date, 3, 8);
      expect(ws.length).toBe(3);
      for (const { w, c } of ws) {
        const m = /^In today's news: "(.*)"$/.exec(c);
        expect(m).not.toBeNull();
        const head = e.stories.find((s) => m![1].replace(/___/g, w.toLowerCase()) === s.head);
        expect(head, `${w} / ${c}`).toBeDefined();
        expect(w.length).toBeGreaterThanOrEqual(4);
        expect(w.length).toBeLessThanOrEqual(8);
      }
    }
  });

  it('a consistent grid at every level, usually with headline words in it', () => {
    let withNews = 0, total = 0;
    for (const e of eds)
      for (let d = 0; d < 6; d++)
        for (const level of [1, 2, 3, 4, 5]) {
          const cfg = CW_LEVELS[level], seed = `${e.edition.date}+${d}|cw|${level}`;
          const news = newsCrosswordWords(e.stories, seed, level <= 2 ? 2 : 3, cfg.max);
          const p = makeCrossword(level, seed, { day: dayIndex(e.edition.date) + d, news });
          expect(p.words.length).toBeGreaterThanOrEqual(cfg.n - 1);
          expect(p.rows).toBeLessThanOrEqual(cfg.size);
          expect(p.cols).toBeLessThanOrEqual(cfg.size);
          expect(new Set(p.words.map((w) => w.w)).size).toBe(p.words.length);
          for (const w of p.words) cwCells(w).forEach((k, i) => expect(p.sol[k]).toBe(w.w[i]));
          total++;
          if (p.words.some((w) => w.c.startsWith("In today's news"))) withNews++;
        }
    expect(withNews / total).toBeGreaterThan(0.9);
  });

  it('bank words are not reused on the next day at the same level', () => {
    for (const level of [1, 3, 5]) {
      let prev = new Set<string>();
      for (let day = 280; day < 300; day++) {
        const p = makeCrossword(level, `day${day}|cw|${level}`, { day });
        const words = new Set(p.words.map((w) => w.w));
        expect([...words].filter((w) => prev.has(w))).toEqual([]);
        prev = words;
      }
    }
  });

  it('the bigger bank has no duplicate answers and every clue is filled in', () => {
    expect(new Set(CW_BANK_ALL.map((e) => e.w)).size).toBe(CW_BANK_ALL.length);
    expect(CW_BANK_ALL.length).toBeGreaterThan(700);
    for (const e of CW_BANK_ALL) {
      expect(e.w).toMatch(/^[A-Z]{3,10}$/);
      expect(e.c.length).toBeGreaterThan(2);
      expect([1, 2, 3]).toContain(e.t);
    }
  });
});

describe('Rulebook from the headlines', () => {
  it('two examples pass and two fail, all from today\'s headlines, and the rule is among 8 options', () => {
    for (const e of eds) {
      const words = headlineWords(e.stories);
      const p = makeRulebookDaily(e.edition.date, words);
      const rule = RB_RULES[p.secret];
      expect(p.given.filter((g) => g.ok).length).toBe(2);
      expect(p.given.filter((g) => !g.ok).length).toBe(2);
      for (const g of p.given) {
        expect(rule.f(g.w)).toBe(g.ok);
        expect(words).toContain(g.w);
      }
      expect(p.opts).toContain(p.secret);
      expect(new Set(p.opts).size).toBe(8);
    }
  });
  it('different days give different rules or examples', () => {
    const e = eds[2], words = headlineWords(e.stories);
    const sigs = new Set(['Friday, 16 October 2026', 'Saturday, 17 October 2026', 'Sunday, 18 October 2026', 'Monday, 19 October 2026']
      .map((d) => JSON.stringify(makeRulebookDaily(d, words))));
    expect(sigs.size).toBe(4);
  });
  it('falls back to spare words when the headlines are short', () => {
    const p = makeRulebookDaily('Friday, 16 October 2026', ['sea']);
    expect(p.given.length).toBe(4);
    for (const g of p.given) expect(RB_RULES[p.secret].f(g.w)).toBe(g.ok);
  });
});

describe('Sure?', () => {
  it('five general-knowledge questions a day; before issue 11 the prototype set is kept', () => {
    for (const issue of [11, 16, 40]) {
      const qs = sureQuestions({ issue });
      expect(qs.length).toBe(SR_N);
      expect(qs.some((q) => q.news)).toBe(false);
      expect(new Set(qs.map((q) => q.q)).size).toBe(SR_N);
      expect(qs.every((q) => Number.isFinite(q.x) && q.sc > 0)).toBe(true);
    }
    const old = sureQuestions({ issue: 10 });
    expect(old.map((q) => q.q)).toEqual(srSet(10).map((i) => SR_Q[i][0]));
  });

  it('questions don\'t repeat for at least seven weeks', () => {
    expect(SR_BANK.length).toBeGreaterThanOrEqual(250);
    const seen = new Map<string, number>();
    const days = Math.floor(SR_BANK.length / SR_N);
    expect(days).toBeGreaterThanOrEqual(49);
    for (let issue = 11; issue < 11 + days; issue++)
      for (const q of sureQuestions({ issue })) {
        expect(seen.has(q.q), `${q.q} on ${seen.get(q.q)} and ${issue}`).toBe(false);
        seen.set(q.q, issue);
      }
  });

  it('the bank is well formed', () => {
    for (const [q, , x, sc, note] of SR_BANK) {
      expect(q.endsWith('?')).toBe(true);
      expect(Number.isFinite(x) && x !== 0).toBe(true);
      expect(sc === null || sc > 0).toBe(true);
      expect(note.length).toBeGreaterThan(3);
    }
    expect(new Set(SR_BANK.map((q) => q[0].toLowerCase())).size).toBe(SR_BANK.length);
  });
});
