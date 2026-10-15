/**
 * A reader's puzzle progress: which puzzles are on, the level for crossword and sudoku,
 * and today's game for each. Kept in this browser. Rules as in the prototype:
 * finish with no hints and at most one check and tomorrow's goes up a level;
 * reveal the answers or use 3+ hints and it eases off.
 */
export type Game = 'cw' | 'su' | 'rb' | 'sr';
export const GAMES: Game[] = ['cw', 'su', 'rb', 'sr'];
export const LEVELLED = (g: Game) => g === 'cw' || g === 'su';
export const NAMES: Record<Game, string> = { cw: 'Crossword', su: 'Sudoku', rb: 'Rulebook', sr: 'Sure?' };
export const BLURB: Record<Game, string> = {
  cw: 'Gets harder as you improve',
  su: 'Gets harder as you improve',
  rb: 'Test words to find a hidden rule',
  sr: 'Give 90% ranges for five real numbers',
};
export const PUZ_KEY = 'dr.puz.v1';

export type Done = null | 'solved' | 'revealed' | 'done';

export interface LevelDay {
  date: string;
  level: number;
  secs: number;
  hints: number;
  checks: number;
  done: Done;
  next?: number;
  rev: Record<string, 1>;
  wrong: string[];
  /** crossword: "r,c" → letter */
  entries: Record<string, string>;
  /** sudoku: 81 digits, 0 = empty */
  vals: string | null;
  /** sudoku: cell → pencilled digits */
  notes: Record<string, string>;
}
export interface RbDay { date: string; done: Done; tests: { w: string; ok: boolean }[]; wrong: number[] }
export interface SrDay { date: string; done: Done; i: number; stage: 'ask' | 'reveal'; res: { l: number; u: number; x: number; hit: boolean; pts: number }[] }

export interface PuzState {
  on: Record<Game, boolean>;
  cw: { level: number; solved: number; day?: LevelDay };
  su: { level: number; solved: number; day?: LevelDay };
  rb: { solved: number; day?: RbDay };
  sr: { n: number; h: number; day?: SrDay };
}

export const initialPuz = (): PuzState => ({
  on: { cw: true, su: true, rb: true, sr: true },
  cw: { level: 1, solved: 0 },
  su: { level: 1, solved: 0 },
  rb: { solved: 0 },
  sr: { n: 0, h: 0 },
});

export function normalisePuz(raw: unknown): PuzState {
  const base = initialPuz();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<PuzState>;
  const lvl = (x: unknown) => (typeof x === 'number' && x >= 1 && x <= 5 ? Math.round(x) : 1);
  return {
    on: { ...base.on, ...(r.on ?? {}) },
    cw: { ...base.cw, ...(r.cw ?? {}), level: lvl(r.cw?.level) },
    su: { ...base.su, ...(r.su ?? {}), level: lvl(r.su?.level) },
    rb: { ...base.rb, ...(r.rb ?? {}) },
    sr: { ...base.sr, ...(r.sr ?? {}) },
  };
}

export const freshLevelDay = (date: string, level: number): LevelDay => ({
  date, level, secs: 0, hints: 0, checks: 0, done: null, rev: {}, wrong: [], entries: {}, vals: null, notes: {},
});

/** Today's game for each puzzle, starting a fresh one when the edition has changed. */
export function withToday(s: PuzState, g: Game, date: string): PuzState {
  if (g === 'cw' || g === 'su') {
    if (s[g].day?.date === date) return s;
    return { ...s, [g]: { ...s[g], day: freshLevelDay(date, s[g].level) } };
  }
  if (g === 'rb') return s.rb.day?.date === date ? s : { ...s, rb: { ...s.rb, day: { date, done: null, tests: [], wrong: [] } } };
  return s.sr.day?.date === date ? s : { ...s, sr: { ...s.sr, day: { date, done: null, i: 0, stage: 'ask', res: [] } } };
}

/** Marks crossword or sudoku finished and sets tomorrow's level. */
export function finishLevelled(s: PuzState, g: 'cw' | 'su', how: 'solved' | 'revealed'): PuzState {
  const P = s[g], day = P.day;
  if (!day || day.done) return s;
  const good = how === 'solved' && day.hints === 0 && day.checks <= 1;
  const poor = how === 'revealed' || day.hints >= 3;
  const level = good ? Math.min(5, day.level + 1) : poor ? Math.max(1, day.level - 1) : day.level;
  return { ...s, [g]: { ...P, level, solved: P.solved + (how === 'solved' ? 1 : 0), day: { ...day, done: how, next: level } } };
}

export const fmtT = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
