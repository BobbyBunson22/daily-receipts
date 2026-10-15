/** The daily sudoku: a seeded full grid, then clues removed while the answer stays unique. */
import { rng, seedFrom, shuffled } from './rng';

/** Counts solutions up to `limit`, filling `g` with the first one found. */
export function suSolve(g: number[], limit: number, r?: () => number): number {
  const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
  const bx = (i: number) => ((i / 27) | 0) * 3 + (((i % 9) / 3) | 0);
  for (let i = 0; i < 81; i++) if (g[i]) { const b = 1 << g[i]; rows[(i / 9) | 0] |= b; cols[i % 9] |= b; boxes[bx(i)] |= b; }
  let count = 0;
  const rec = (): boolean => {
    let best = -1, bm = 0, bn = 10;
    for (let i = 0; i < 81; i++)
      if (!g[i]) {
        const m = ~(rows[(i / 9) | 0] | cols[i % 9] | boxes[bx(i)]) & 0x3fe;
        let n = 0;
        for (let x = m; x; x &= x - 1) n++;
        if (n < bn) { bn = n; best = i; bm = m; if (!n) return false; }
      }
    if (best < 0) { count++; return count >= limit; }
    let ds: number[] = [];
    for (let d = 1; d <= 9; d++) if (bm & (1 << d)) ds.push(d);
    if (r) ds = shuffled(ds, r);
    const ri = (best / 9) | 0, ci = best % 9, bi = bx(best);
    for (const d of ds) {
      const b = 1 << d;
      g[best] = d; rows[ri] |= b; cols[ci] |= b; boxes[bi] |= b;
      if (rec()) return true;
      g[best] = 0; rows[ri] &= ~b; cols[ci] &= ~b; boxes[bi] &= ~b;
    }
    return false;
  };
  rec();
  return count;
}

export const SU_CLUES: Record<number, number> = { 1: 44, 2: 37, 3: 32, 4: 28, 5: 25 };

export interface Sudoku { level: number; puzzle: string; solution: string; clues: number }

export function makeSudoku(level: number, seedStr: string): Sudoku {
  const r = rng(seedFrom(seedStr)), g = new Array(81).fill(0);
  suSolve(g, 1, r);
  const sol = g.slice(), target = SU_CLUES[level] ?? 44;
  let clues = 81;
  for (const i of shuffled([...Array(81).keys()], r)) {
    if (clues <= target) break;
    const v = g[i];
    g[i] = 0;
    if (suSolve(g.slice(), 2) !== 1) g[i] = v;
    else clues--;
  }
  return { level, puzzle: g.join(''), solution: sol.join(''), clues };
}

export const suPeers = (i: number, j: number) =>
  ((i / 9) | 0) === ((j / 9) | 0) || i % 9 === j % 9 || (((i / 27) | 0) === ((j / 27) | 0) && (((i % 9) / 3) | 0) === (((j % 9) / 3) | 0));
