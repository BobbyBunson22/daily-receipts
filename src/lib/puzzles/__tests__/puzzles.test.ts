/** Puzzle generators: sudoku always has exactly one solution, crosswords are consistent,
 *  and every puzzle matches the prototype's for the same day, so all readers share it. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

import { cwCells, makeCrossword } from '../crossword';
import { RB_RULES, makeRulebook } from '../rulebook';
import { makeSudoku, suSolve, SU_CLUES } from '../sudoku';
import { SR_N, SR_Q, srNum, srScore, srSet } from '../sure';

// The prototype's own generator code, run as-is for comparison.
const proto = vm.runInNewContext(
  readFileSync(join(__dirname, 'prototype-generators.js.txt'), 'utf8') + ';({makeCrossword, makeSudoku})',
  {},
) as { makeCrossword: (l: number, s: string) => unknown; makeSudoku: (l: number, s: string) => unknown };

const dates = ['Thursday, 15 October 2026', 'Friday, 16 October 2026', 'Saturday, 17 October 2026', 'Sunday, 1 November 2026'];

describe('sudoku', () => {
  for (const level of [1, 2, 3, 4, 5])
    it(`level ${level}: exactly one solution, the right number of clues, and it is the stored solution`, () => {
      for (const d of dates) {
        const s = makeSudoku(level, `${d}|su|${level}`);
        const grid = [...s.puzzle].map(Number);
        expect(suSolve(grid.slice(), 2)).toBe(1);
        const solved = grid.slice();
        suSolve(solved, 1);
        expect(solved.join('')).toBe(s.solution);
        expect(s.clues).toBe(SU_CLUES[level]);
        expect([...s.puzzle].every((c, i) => c === '0' || c === s.solution[i])).toBe(true);
      }
    });

  it('a valid completed grid: every row, column and box has 1 to 9', () => {
    const s = makeSudoku(3, 'x').solution;
    const groups: number[][] = [];
    for (let k = 0; k < 9; k++) {
      groups.push([...Array(9).keys()].map((j) => k * 9 + j));
      groups.push([...Array(9).keys()].map((j) => j * 9 + k));
      groups.push([...Array(9).keys()].map((j) => (((k / 3) | 0) * 3 + ((j / 3) | 0)) * 9 + (k % 3) * 3 + (j % 3)));
    }
    for (const g of groups) expect(g.map((i) => s[i]).sort().join('')).toBe('123456789');
  });

  it('matches the prototype for the same day and level', () => {
    for (const level of [1, 3, 5]) expect(makeSudoku(level, `${dates[0]}|su|${level}`)).toEqual(proto.makeSudoku(level, `${dates[0]}|su|${level}`));
  });
});

describe('crossword', () => {
  it('every word is in the grid, letters agree where words cross, and clues are numbered', () => {
    for (const level of [1, 2, 3, 4, 5])
      for (const d of dates) {
        const p = makeCrossword(level, `${d}|cw|${level}`);
        expect(p.words.length).toBeGreaterThanOrEqual(4);
        for (const w of p.words) {
          cwCells(w).forEach((k, i) => expect(p.sol[k]).toBe(w.w[i]));
          expect(p.nums[`${w.r},${w.col}`]).toBe(w.num);
        }
        const keys = Object.keys(p.sol).map((k) => k.split(',').map(Number));
        expect(Math.max(...keys.map(([r]) => r)) + 1).toBe(p.rows);
        expect(Math.max(...keys.map(([, c]) => c)) + 1).toBe(p.cols);
      }
  });

  it('matches the prototype for the same day and level', () => {
    for (const level of [1, 3, 5]) expect(JSON.parse(JSON.stringify(makeCrossword(level, `${dates[1]}|cw|${level}`)))).toEqual(proto.makeCrossword(level, `${dates[1]}|cw|${level}`));
  });
});

describe('rulebook', () => {
  it('the example words really pass and fail the secret rule, and the answer is among the options', () => {
    for (const d of dates) {
      const p = makeRulebook(d);
      expect(RB_RULES[p.secret].f(p.given[0].w)).toBe(true);
      expect(RB_RULES[p.secret].f(p.given[1].w)).toBe(false);
      expect(p.opts).toContain(p.secret);
      expect(new Set(p.opts).size).toBe(8);
    }
  });
});

describe('Sure?', () => {
  it('five different questions each edition', () => {
    for (const issue of [1, 7, 10, 30]) expect(new Set(srSet(issue)).size).toBe(SR_N);
    expect(SR_Q.every((q) => Number.isFinite(q[2]))).toBe(true);
  });
  it('scores tight hits highest and punishes misses', () => {
    expect(srScore(340, 350, 346, 346)).toBeGreaterThan(srScore(100, 1000, 346, 346));
    expect(srScore(100, 1000, 346, 346)).toBeGreaterThan(srScore(400, 410, 346, 346));
    expect(srNum('1,345')).toBe(1345);
    expect(srNum('£42.5')).toBe(42.5);
    expect(Number.isNaN(srNum(''))).toBe(true);
  });
});
