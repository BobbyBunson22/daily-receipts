/** The daily crossword generator, ported from the prototype. */
import { CW_BANK_TEXT } from './cw-bank';
import { rng, seedFrom, shuffled } from './rng';

export interface BankEntry { t: number; w: string; c: string }
export const CW_BANK: BankEntry[] = CW_BANK_TEXT.split('\n').map((l) => {
  const [t, w, c] = l.split('|');
  return { t: +t, w, c };
});

export const CW_LEVELS: Record<number, { n: number; tiers: number[]; max: number; size: number }> = {
  1: { n: 6, tiers: [1], max: 6, size: 9 },
  2: { n: 7, tiers: [1, 1, 1, 2], max: 7, size: 9 },
  3: { n: 9, tiers: [1, 2, 2], max: 8, size: 11 },
  4: { n: 10, tiers: [2, 2, 3], max: 9, size: 11 },
  5: { n: 12, tiers: [2, 3, 3, 3], max: 10, size: 11 },
};

export type Dir = 'a' | 'd';
export interface Word { w: string; c: string; r: number; col: number; dir: Dir; num: number }
export interface Crossword {
  level: number;
  rows: number;
  cols: number;
  words: Word[];
  /** "r,c" → letter */
  sol: Record<string, string>;
  /** "r,c" → index of the across/down word through it */
  at: Record<string, Partial<Record<Dir, number>>>;
  /** "r,c" → clue number */
  nums: Record<string, number>;
}

interface Cell { ch: string; a?: boolean; d?: boolean }
interface Placed { w: string; c: string; r: number; col: number; dir: Dir }

function cwLayout(cands: BankEntry[], cfg: { n: number; size: number }, r: () => number) {
  const cells = new Map<string, Cell>();
  const K = (a: number, b: number) => `${a},${b}`;
  const words: Placed[] = [];
  let minR = 0, maxR = 0, minC = 0, maxC = 0, inters = 0;
  const fits = (w: string, sr: number, sc: number, dir: Dir) => {
    const dr = dir === 'd' ? 1 : 0, dc = dir === 'a' ? 1 : 0, L = w.length;
    if (cells.has(K(sr - dr, sc - dc)) || cells.has(K(sr + dr * L, sc + dc * L))) return -1;
    let hit = 0;
    for (let i = 0; i < L; i++) {
      const rr = sr + dr * i, cc = sc + dc * i, cell = cells.get(K(rr, cc));
      if (cell) {
        if (cell.ch !== w[i] || cell[dir]) return -1;
        hit++;
      } else if (dir === 'a' ? cells.has(K(rr - 1, cc)) || cells.has(K(rr + 1, cc)) : cells.has(K(rr, cc - 1)) || cells.has(K(rr, cc + 1))) return -1;
    }
    const a0 = Math.min(minR, sr), a1 = Math.max(maxR, sr + dr * (L - 1)), b0 = Math.min(minC, sc), b1 = Math.max(maxC, sc + dc * (L - 1));
    if (a1 - a0 + 1 > cfg.size || b1 - b0 + 1 > cfg.size) return -1;
    if (!hit || hit === L) return -1;
    return hit * 10 - ((a1 - a0 + 1) * (b1 - b0 + 1) - (maxR - minR + 1) * (maxC - minC + 1)) * 0.3 + r() * 3;
  };
  const put = (e: BankEntry, sr: number, sc: number, dir: Dir) => {
    const dr = dir === 'd' ? 1 : 0, dc = dir === 'a' ? 1 : 0;
    for (let i = 0; i < e.w.length; i++) {
      const k = K(sr + dr * i, sc + dc * i), cell = cells.get(k) ?? { ch: e.w[i] };
      if (cell.a || cell.d) inters++;
      cell[dir] = true;
      cells.set(k, cell);
    }
    minR = Math.min(minR, sr); maxR = Math.max(maxR, sr + dr * (e.w.length - 1));
    minC = Math.min(minC, sc); maxC = Math.max(maxC, sc + dc * (e.w.length - 1));
    words.push({ w: e.w, c: e.c, r: sr, col: sc, dir });
  };
  put(cands[0], 0, 0, r() < 0.5 ? 'a' : 'd');
  for (const e of cands.slice(1)) {
    if (words.length >= cfg.n) break;
    if (words.some((x) => x.w === e.w)) continue;
    let best: { s: number; sr: number; sc: number; nd: Dir } | null = null;
    for (const pw of words) {
      const nd: Dir = pw.dir === 'a' ? 'd' : 'a';
      for (let i = 0; i < pw.w.length; i++)
        for (let j = 0; j < e.w.length; j++) {
          if (pw.w[i] !== e.w[j]) continue;
          const cr = pw.r + (pw.dir === 'd' ? i : 0), cc = pw.col + (pw.dir === 'a' ? i : 0);
          const sr = cr - (nd === 'd' ? j : 0), sc = cc - (nd === 'a' ? j : 0);
          const s = fits(e.w, sr, sc, nd);
          if (s >= 0 && (!best || s > best.s)) best = { s, sr, sc, nd };
        }
    }
    if (best) put(e, best.sr, best.sc, best.nd);
  }
  return { words, inters, minR, minC, rows: maxR - minR + 1, cols: maxC - minC + 1, score: words.length * 100 + inters * 12 - (maxR - minR + 1) * (maxC - minC + 1) * 0.5 };
}

export function makeCrossword(level: number, seedStr: string): Crossword {
  const cfg = CW_LEVELS[level] ?? CW_LEVELS[1], r = rng(seedFrom(seedStr));
  const byTier: Record<number, BankEntry[]> = {};
  [1, 2, 3].forEach((t) => (byTier[t] = shuffled(CW_BANK.filter((e) => e.t === t && e.w.length >= 3 && e.w.length <= cfg.max), r)));
  let best: ReturnType<typeof cwLayout> | null = null;
  for (let attempt = 0; attempt < 36; attempt++) {
    const used = new Set<string>(), cands: BankEntry[] = [];
    while (cands.length < cfg.n * 5) {
      const t = cfg.tiers[Math.floor(r() * cfg.tiers.length)], list = byTier[t];
      const e = list[Math.floor(r() * list.length)];
      if (!used.has(e.w)) { used.add(e.w); cands.push(e); }
    }
    const longFirst = cands.slice().sort((a, b) => b.w.length - a.w.length);
    const start = longFirst.splice(Math.floor(r() * 3), 1)[0];
    const res = cwLayout([start, ...shuffled(longFirst, r)], cfg, r);
    if (!best || res.score > best.score) best = res;
    if (best.words.length >= cfg.n && attempt >= 12) break;
  }
  const b = best!;
  const words = b.words.map((x) => ({ w: x.w, c: x.c, r: x.r - b.minR, col: x.col - b.minC, dir: x.dir, num: 0 }));
  const starts = [...new Set(words.map((x) => x.r * 100 + x.col))].sort((p, q) => p - q);
  words.forEach((x) => (x.num = starts.indexOf(x.r * 100 + x.col) + 1));
  words.sort((p, q) => (p.dir === q.dir ? p.num - q.num : p.dir === 'a' ? -1 : 1));
  const sol: Crossword['sol'] = {}, at: Crossword['at'] = {};
  words.forEach((x, wi) => {
    for (let i = 0; i < x.w.length; i++) {
      const k = `${x.r + (x.dir === 'd' ? i : 0)},${x.col + (x.dir === 'a' ? i : 0)}`;
      sol[k] = x.w[i];
      (at[k] = at[k] ?? {})[x.dir] = wi;
    }
  });
  const nums: Crossword['nums'] = {};
  words.forEach((x) => (nums[`${x.r},${x.col}`] = x.num));
  return { level, rows: b.rows, cols: b.cols, words, sol, at, nums };
}

export const cwCells = (w: Word) => [...w.w].map((_, i) => `${w.r + (w.dir === 'd' ? i : 0)},${w.col + (w.dir === 'a' ? i : 0)}`);
