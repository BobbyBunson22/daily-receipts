'use client';
/** The daily puzzles: crossword, sudoku, Rulebook and Sure?, ported from the prototype. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { CW_LEVELS, cwCells, makeCrossword, type Dir } from '../lib/puzzles/crossword';
import { dayIndex, headlineWords, isFresh, newsCrosswordWords } from '../lib/puzzles/daily';
import { RB_MAX, RB_RULES, RB_UNLOCK, makeRulebook, makeRulebookDaily } from '../lib/puzzles/rulebook';
import * as P from '../lib/puzzles/state';
import { makeSudoku, suPeers } from '../lib/puzzles/sudoku';
import { SR_N, srFmt, srNum, srScore, sureQuestions } from '../lib/puzzles/sure';
import { track } from '../lib/reader/track';
import { useReader } from './ReaderContext';
import { Sheet } from './Sheets';

// ---------------------------------------------------------------- store

interface PuzCtx {
  puz: P.PuzState;
  set: (fn: (s: P.PuzState) => P.PuzState) => void;
  anyOn: boolean;
}
const Ctx = createContext<PuzCtx | null>(null);
export const usePuzzles = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePuzzles outside PuzzleProvider');
  return c;
};

export function PuzzleProvider({ children }: { children: React.ReactNode }) {
  const [puz, setPuz] = useState<P.PuzState>(P.initialPuz);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state after hydration
      setPuz(P.normalisePuz(JSON.parse(localStorage.getItem(P.PUZ_KEY) ?? 'null')));
    } catch {
      // fine
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(P.PUZ_KEY, JSON.stringify(puz));
    } catch {
      // fine
    }
  }, [puz, ready]);
  const set = useCallback((fn: (s: P.PuzState) => P.PuzState) => setPuz((s) => fn(s)), []);
  const value = useMemo(() => ({ puz, set, anyOn: P.GAMES.some((g) => puz.on[g]) }), [puz, set]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ---------------------------------------------------------------- shared bits

const ICONS: Record<P.Game, React.ReactNode> = {
  cw: <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3 3h6v6H3zM15 15h6v6h-6z" fill="currentColor" /></svg>,
  su: <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18" fill="none" stroke="currentColor" strokeWidth="1.8" /><text x="6" y="8.2" fontSize="5.5" textAnchor="middle" fill="currentColor" fontFamily="sans-serif" fontWeight="700">3</text><text x="12" y="14.2" fontSize="5.5" textAnchor="middle" fill="currentColor" fontFamily="sans-serif" fontWeight="700">7</text><text x="18" y="20.2" fontSize="5.5" textAnchor="middle" fill="currentColor" fontFamily="sans-serif" fontWeight="700">1</text></svg>,
  rb: <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M5 3.5h14v17H5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M8 8.5l1.6 1.6L12.5 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M8 14l3.5 3.5M11.5 14L8 17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M14.5 8.5H17M14.5 15.7H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>,
  sr: <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M2.5 13h19" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2" /><rect x="6" y="10" width="10" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12.5 5.5v15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>,
};

const LevelDots = ({ n }: { n: number }) => (
  <span className="lvl" aria-label={`Level ${n} of 5`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</span>
);

/** "Tap again to confirm" without a dialog. */
function useConfirm(): [boolean, () => boolean] {
  const [at, setAt] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!at) return;
    const t = setTimeout(() => { setAt(0); tick((x) => x + 1); }, 4000);
    return () => clearTimeout(t);
  }, [at]);
  const ask = () => {
    if (at) { setAt(0); return true; }
    setAt(Date.now());
    return false;
  };
  return [!!at, ask];
}

/** Starts today's game when a puzzle is opened, and records it once. */
function useToday(g: P.Game) {
  const { ed } = useReader();
  const { puz, set } = usePuzzles();
  const ready = puz[g].day?.date === ed.date;
  useEffect(() => {
    if (ready) return;
    set((s) => P.withToday(s, g, ed.date));
    track('puzzle_start', { game: g, level: P.LEVELLED(g) ? puz[g as 'cw' | 'su'].level : null });
  }, [ready, g, ed.date, set, puz]);
  return ready;
}

/** Counts the seconds while the puzzle is open, unfinished and on screen. */
function useTimer(g: 'cw' | 'su', running: boolean) {
  const { set } = usePuzzles();
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      set((s) => {
        const day = s[g].day;
        return day && !day.done ? { ...s, [g]: { ...s[g], day: { ...day, secs: day.secs + 1 } } } : s;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [g, running, set]);
}

function useFinish() {
  const { set, puz } = usePuzzles();
  const { toast } = useReader();
  return (g: 'cw' | 'su', how: 'solved' | 'revealed') => {
    const day = puz[g].day;
    set((s) => P.finishLevelled(s, g, how));
    toast(how === 'solved' ? `Solved in ${P.fmtT(day?.secs ?? 0)}` : 'Answers revealed');
    track('puzzle_done', { game: g, how, level: day?.level, secs: day?.secs, hints: day?.hints, checks: day?.checks });
  };
}

function ResultPanel({ g }: { g: 'cw' | 'su' }) {
  const { puz } = usePuzzles();
  const { setOverlay } = useReader();
  const day = puz[g].day!;
  const nm = P.NAMES[g].toLowerCase();
  const next = day.next ?? day.level;
  const tomorrow = next > day.level ? `Tomorrow's ${nm} steps up to level ${next}.` : next < day.level ? `Tomorrow's ${nm} eases off to level ${next}.` : `Tomorrow's ${nm} stays at level ${next}.`;
  const how = day.done === 'solved'
    ? `Solved in ${P.fmtT(day.secs)}${day.hints ? ` with ${day.hints} ${day.hints === 1 ? 'hint' : 'hints'}` : ' with no help'}.`
    : 'Answers revealed. No harm done.';
  return (
    <div className="pzdone" role="status">
      <h3>{day.done === 'solved' ? 'Nicely done.' : "Here's the answer."}</h3>
      <p>{how} {tomorrow}</p>
      <button className="pill solid" onClick={() => setOverlay({ kind: 'puzzles' })}>Back to puzzles</button>
    </div>
  );
}

function ShareBox({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const [label, setLabel] = useState('Copy result');
  const done = (m: string) => { setLabel(m); setTimeout(() => setLabel('Copy result'), 2000); };
  const pick = () => {
    if (!ref.current) return;
    const r = document.createRange();
    r.selectNodeContents(ref.current);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    done('Selected, copy it now');
  };
  return (
    <>
      <pre className="pzshare" ref={ref}>{text}</pre>
      <div className="pzbtns">
        <button className="pill solid" onClick={() => {
          try {
            navigator.clipboard.writeText(text).then(() => { done('Copied'); track('share', { what: 'puzzle' }); }, pick);
          } catch {
            pick();
          }
        }}>{label}</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- list

function status(g: P.Game, puz: P.PuzState, date: string): string {
  if (g === 'rb') {
    const d = puz.rb.day;
    if (!d || d.date !== date) return 'Not started';
    return d.done === 'solved' ? `Solved with ${d.tests.length} ${d.tests.length === 1 ? 'test' : 'tests'}` : d.done ? 'Rule revealed' : d.tests.length ? `In progress · ${d.tests.length} tests` : 'Not started';
  }
  if (g === 'sr') {
    const d = puz.sr.day;
    if (!d || d.date !== date) return 'Not started';
    if (d.done) return `${d.res.filter((x) => x.hit).length} of 5 inside · ${d.res.reduce((a, x) => a + x.pts, 0)} pts`;
    return d.res.length ? `Question ${d.res.length + (d.stage === 'ask' ? 1 : 0)} of 5` : 'Not started';
  }
  const d = puz[g].day;
  if (!d || d.date !== date) return 'Not started';
  if (d.done === 'solved') return `Solved in ${P.fmtT(d.secs)}`;
  if (d.done) return 'Answers revealed';
  return d.secs ? `In progress · ${P.fmtT(d.secs)}` : 'Not started';
}

export function PuzzlesSheet() {
  const { ed, setOverlay } = useReader();
  const { puz } = usePuzzles();
  const games = P.GAMES.filter((g) => puz.on[g]);
  return (
    <Sheet label="Daily puzzles">
      <h2 className="sh-title">Daily puzzles</h2>
      {!games.length ? (
        <>
          <p className="muted">All the puzzles are switched off. Turn them back on in settings.</p>
          <p><button className="pill solid" onClick={() => setOverlay({ kind: 'settings' })}>Open settings</button></p>
        </>
      ) : (
        <>
          <p className="stand">A fresh set with every edition. Do well at the crossword and sudoku and tomorrow&apos;s get harder.</p>
          {games.map((g) => {
            const today = puz[g].day?.date === ed.date ? puz[g].day : undefined;
            const started = g === 'rb' ? !!puz.rb.day?.tests.length : g === 'sr' ? !!puz.sr.day?.res.length : !!(today as P.LevelDay | undefined)?.secs;
            const lv = P.LEVELLED(g) ? ((today as P.LevelDay | undefined)?.level ?? puz[g as 'cw' | 'su'].level) : 0;
            return (
              <button key={g} className="pzcard" onClick={() => setOverlay({ kind: 'game', game: g })}>
                <span className="pzicon">{ICONS[g]}</span>
                <span>
                  <h3>{P.NAMES[g]}</h3>
                  <small>{lv ? `Level ${lv} of 5 · ` : ''}{status(g, puz, ed.date)}</small>
                  {lv ? <LevelDots n={lv} /> : <span className="pzsub">{P.BLURB[g]}</span>}
                </span>
                <span className="pzgo">{today?.done ? 'View' : today && started ? 'Resume' : 'Play'}</span>
              </button>
            );
          })}
          <p className="muted">Crossword and sudoku levels go up when you finish without hints, and ease off if you reveal the answers. Turn any puzzle off in settings.</p>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- crossword

function Crossword() {
  const { ed, toast } = useReader();
  const { puz, set } = usePuzzles();
  const finish = useFinish();
  const day = puz.cw.day!;
  const p = useMemo(() => {
    const seed = `${ed.date}|cw|${day.level}`;
    if (!isFresh(ed.issue)) return makeCrossword(day.level, seed);
    const cfg = CW_LEVELS[day.level] ?? CW_LEVELS[1];
    return makeCrossword(day.level, seed, { day: dayIndex(ed.date), news: newsCrosswordWords(ed.stories, seed, day.level <= 2 ? 2 : 3, cfg.max) });
  }, [ed.date, ed.issue, ed.stories, day.level]);
  const [sel, setSel] = useState<{ r: number; c: number; dir: Dir }>(() => ({ r: p.words[0].r, c: p.words[0].col, dir: p.words[0].dir }));
  const [confirming, confirm] = useConfirm();
  const inp = useRef<HTMLInputElement>(null);
  useTimer('cw', !day.done);

  const wordAt = (s: typeof sel) => {
    const a = p.at[`${s.r},${s.c}`];
    return a ? (a[s.dir] ?? a[s.dir === 'a' ? 'd' : 'a'] ?? 0) : 0;
  };
  const wi = wordAt(sel);
  const w = p.words[wi];
  const cells = cwCells(w);
  const selK = `${sel.r},${sel.c}`;
  const focus = () => { inp.current?.focus({ preventScroll: true }); try { inp.current?.setSelectionRange(1, 1); } catch { /* fine */ } };

  const update = (fn: (d: P.LevelDay) => P.LevelDay) => set((s) => (s.cw.day ? { ...s, cw: { ...s.cw, day: fn(s.cw.day) } } : s));
  const complete = (entries: Record<string, string>) => Object.keys(p.sol).every((k) => entries[k] === p.sol[k]);
  const step = (s: typeof sel, by: number) => {
    const ws = cwCells(p.words[wordAt(s)]), i = ws.indexOf(`${s.r},${s.c}`), j = i + by;
    if (j < 0 || j >= ws.length) return null;
    const [r, c] = ws[j].split(',').map(Number);
    return { ...s, r, c, dir: p.words[wordAt(s)].dir };
  };

  const type = (ch: string) => {
    if (day.done) return;
    const entries = { ...day.entries, [selK]: ch };
    update((d) => ({ ...d, entries, wrong: d.wrong.filter((x) => x !== selK) }));
    const nxt = step({ ...sel, dir: w.dir }, 1);
    if (nxt) setSel(nxt);
    if (complete(entries)) finish('cw', 'solved');
  };
  const back = () => {
    if (day.done) return;
    if (day.entries[selK]) update((d) => { const e = { ...d.entries }; delete e[selK]; return { ...d, entries: e }; });
    else {
      const prv = step({ ...sel, dir: w.dir }, -1);
      if (prv) {
        setSel(prv);
        const k = `${prv.r},${prv.c}`;
        update((d) => { const e = { ...d.entries }; delete e[k]; return { ...d, entries: e }; });
      }
    }
  };
  const selectWord = (i: number) => {
    const x = p.words[(i + p.words.length) % p.words.length];
    const k = cwCells(x).find((c) => !day.entries[c]) ?? cwCells(x)[0];
    const [r, c] = k.split(',').map(Number);
    setSel({ r, c, dir: x.dir });
  };
  const tapCell = (k: string) => {
    const [r, c] = k.split(',').map(Number), a = p.at[k];
    if (sel.r === r && sel.c === c) {
      const other: Dir = w.dir === 'a' ? 'd' : 'a';
      if (a[other] !== undefined) setSel({ r, c, dir: other });
    } else setSel({ r, c, dir: a[w.dir] !== undefined ? w.dir : w.dir === 'a' ? 'd' : 'a' });
    focus();
  };
  const act = (a: 'check' | 'letter' | 'reveal') => {
    if (day.done) return;
    if (a === 'check') {
      const wrong = Object.keys(day.entries).filter((k) => day.entries[k] && day.entries[k] !== p.sol[k]);
      update((d) => ({ ...d, checks: d.checks + 1, wrong }));
      toast(wrong.length ? `${wrong.length} ${wrong.length === 1 ? 'letter needs' : 'letters need'} another look` : 'All good so far');
    } else if (a === 'letter') {
      let k: string | undefined = selK;
      if (day.entries[k] === p.sol[k]) k = cells.find((x) => day.entries[x] !== p.sol[x]) ?? Object.keys(p.sol).find((x) => day.entries[x] !== p.sol[x]);
      if (!k) return;
      const kk = k;
      const entries = { ...day.entries, [kk]: p.sol[kk] };
      update((d) => ({ ...d, entries, rev: { ...d.rev, [kk]: 1 }, hints: d.hints + 1, wrong: d.wrong.filter((x) => x !== kk) }));
      if (complete(entries)) setTimeout(() => finish('cw', 'solved'), 0);
      focus();
    } else {
      if (!confirm()) return;
      const rev = { ...day.rev };
      Object.keys(p.sol).forEach((k) => { if (day.entries[k] !== p.sol[k]) rev[k] = 1; });
      update((d) => ({ ...d, entries: { ...p.sol }, rev, wrong: [] }));
      finish('cw', 'revealed');
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    const mv = ({ ArrowRight: [0, 1, 'a'], ArrowLeft: [0, -1, 'a'], ArrowDown: [1, 0, 'd'], ArrowUp: [-1, 0, 'd'] } as Record<string, [number, number, Dir]>)[e.key];
    if (mv) {
      e.preventDefault();
      if (w.dir !== mv[2] && p.at[selK][mv[2]] !== undefined) setSel({ ...sel, dir: mv[2] });
      else {
        const k = `${sel.r + mv[0]},${sel.c + mv[1]}`;
        if (p.sol[k]) setSel({ r: sel.r + mv[0], c: sel.c + mv[1], dir: p.at[k][w.dir] !== undefined ? w.dir : mv[2] });
      }
      return;
    }
    if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); selectWord(wi + (e.shiftKey ? -1 : 1)); }
  };

  const inWord = new Set(cells), wrong = new Set(day.wrong);
  const solvedW = (i: number) => cwCells(p.words[i]).every((k) => day.entries[k] === p.sol[k]);
  const clueList = (dir: Dir) => p.words.map((x, i) => ({ x, i })).filter((o) => o.x.dir === dir).map(({ x, i }) => (
    <li key={i}><button className={`cwclue${i === wi ? ' on' : ''}${solvedW(i) ? ' done' : ''}`} onClick={() => { selectWord(i); focus(); }}><b>{x.num}</b>{x.c} <small>({x.w.length})</small></button></li>
  ));

  return (
    <Sheet label="Daily crossword" tall>
      <h2 className="sh-title">Daily crossword</h2>
      <div className="pzmeta"><LevelDots n={day.level} /><span>Level {day.level} of 5</span><span id="pz-time">{P.fmtT(day.secs)}</span></div>
      <input ref={inp} className="cw-in" defaultValue="_" autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false} aria-label="Type a letter for the selected square"
        onKeyDown={onKey}
        onInput={(e) => {
          const t = e.currentTarget, ne = e.nativeEvent as InputEvent;
          if (ne.inputType === 'deleteContentBackward') back();
          else {
            const ch = ((ne.data ?? t.value.slice(1)) || '').toUpperCase().replace(/[^A-Z]/g, '').slice(-1);
            if (ch) type(ch);
          }
          t.value = '_';
          try { t.setSelectionRange(1, 1); } catch { /* fine */ }
        }} />
      {day.done ? <ResultPanel g="cw" /> : (
        <div className="cwbar">
          <button onClick={() => { selectWord(wi - 1); focus(); }} aria-label="Previous clue">‹</button>
          <p><b>{w.num} {w.dir === 'a' ? 'Across' : 'Down'}</b>{w.c} ({w.w.length})</p>
          <button onClick={() => { selectWord(wi + 1); focus(); }} aria-label="Next clue">›</button>
        </div>
      )}
      <div className="cwgrid" style={{ ['--n' as string]: p.cols }}>
        {Array.from({ length: p.rows * p.cols }, (_, idx) => {
          const r = Math.floor(idx / p.cols), c = idx % p.cols, k = `${r},${c}`;
          if (!p.sol[k]) return <span key={k} className="cwb" />;
          const v = day.entries[k] ?? '';
          const cls = ['cwc', inWord.has(k) && !day.done ? 'inw' : '', k === selK && !day.done ? 'sel' : '', wrong.has(k) ? 'bad' : '', day.rev[k] ? 'rev' : ''].filter(Boolean).join(' ');
          return (
            <button key={k} className={cls} onClick={() => tapCell(k)} aria-label={`${p.nums[k] ? `${p.nums[k]}, ` : ''}row ${r + 1} column ${c + 1}${v ? `, ${v}` : ', empty'}`}>
              {p.nums[k] ? <i>{p.nums[k]}</i> : null}<b>{v}</b>
            </button>
          );
        })}
      </div>
      {!day.done && (
        <div className="pzbtns">
          <button className="pill" onClick={() => act('check')}>Check</button>
          <button className="pill" onClick={() => act('letter')}>Reveal letter</button>
          <button className="pill" onClick={() => act('reveal')}>{confirming ? 'Sure? Tap again' : 'Reveal all'}</button>
        </div>
      )}
      <div className="cwclues">
        <div><h4>Across</h4><ol>{clueList('a')}</ol></div>
        <div><h4>Down</h4><ol>{clueList('d')}</ol></div>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- sudoku

function Sudoku() {
  const { ed, toast, overlay } = useReader();
  const { puz, set } = usePuzzles();
  const finish = useFinish();
  const day = puz.su.day!;
  const p = useMemo(() => makeSudoku(day.level, `${ed.date}|su|${day.level}`), [ed.date, day.level]);
  const [sel, setSel] = useState(-1);
  const [notesMode, setNotesMode] = useState(false);
  const [confirming, confirm] = useConfirm();
  const grid = useRef<HTMLDivElement>(null);
  useTimer('su', !day.done);
  const v = day.vals ?? p.puzzle;

  const update = (fn: (d: P.LevelDay) => P.LevelDay) => set((s) => (s.su.day ? { ...s, su: { ...s.su, day: fn(s.su.day) } } : s));
  const put = (vals: string, i: number, d: string) => vals.slice(0, i) + d + vals.slice(i + 1);

  const input = (n: number) => {
    const i = sel;
    if (day.done || i < 0 || p.puzzle[i] !== '0') return;
    const d = String(n);
    if (notesMode) {
      update((x) => {
        const notes = { ...x.notes }, cur = notes[i] ?? '';
        notes[i] = cur.includes(d) ? cur.replace(d, '') : [...cur + d].sort().join('');
        if (!notes[i]) delete notes[i];
        return { ...x, notes, vals: (x.vals ?? p.puzzle)[i] !== '0' ? put(x.vals ?? p.puzzle, i, '0') : x.vals ?? p.puzzle };
      });
      return;
    }
    const vals = put(v, i, v[i] === d ? '0' : d);
    update((x) => {
      const notes = { ...x.notes };
      delete notes[i];
      if (vals[i] === d) for (let j = 0; j < 81; j++) if (notes[j] && suPeers(i, j)) { notes[j] = notes[j].replace(d, ''); if (!notes[j]) delete notes[j]; }
      const rev = { ...x.rev };
      delete rev[i];
      return { ...x, vals, notes, rev, wrong: x.wrong.filter((y) => y !== String(i)) };
    });
    if (vals === p.solution) finish('su', 'solved');
  };
  const act = (a: 'notes' | 'erase' | 'check' | 'hint' | 'reveal') => {
    if (a === 'notes') return setNotesMode((m) => !m);
    if (day.done) return;
    if (a === 'erase') {
      if (sel >= 0 && p.puzzle[sel] === '0') update((x) => { const notes = { ...x.notes }; delete notes[sel]; return { ...x, vals: put(v, sel, '0'), notes, wrong: x.wrong.filter((y) => y !== String(sel)) }; });
    } else if (a === 'check') {
      const wrong = [...Array(81).keys()].filter((i) => v[i] !== '0' && v[i] !== p.solution[i]).map(String);
      update((x) => ({ ...x, checks: x.checks + 1, wrong }));
      toast(wrong.length ? `${wrong.length} ${wrong.length === 1 ? 'square needs' : 'squares need'} another look` : 'All good so far');
    } else if (a === 'hint') {
      let i = sel;
      if (i < 0 || v[i] === p.solution[i]) i = [...Array(81).keys()].find((x) => v[x] !== p.solution[x]) ?? -1;
      if (i < 0) return;
      const vals = put(v, i, p.solution[i]);
      update((x) => { const notes = { ...x.notes }; delete notes[i]; return { ...x, vals, notes, rev: { ...x.rev, [i]: 1 }, hints: x.hints + 1, wrong: x.wrong.filter((y) => y !== String(i)) }; });
      setSel(i);
      if (vals === p.solution) setTimeout(() => finish('su', 'solved'), 0);
    } else {
      if (!confirm()) return;
      const rev = { ...day.rev };
      for (let i = 0; i < 81; i++) if (v[i] !== p.solution[i]) rev[i] = 1;
      update((x) => ({ ...x, vals: p.solution, notes: {}, wrong: [], rev }));
      finish('su', 'revealed');
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlay?.kind !== 'game' || overlay.game !== 'su' || (e.target as HTMLElement).matches('input,textarea')) return;
      if (/^[1-9]$/.test(e.key)) { e.preventDefault(); input(+e.key); }
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { e.preventDefault(); act('erase'); }
      else if (e.key === 'n' || e.key === 'N') act('notes');
      else {
        const mv = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 9, ArrowUp: -9 } as Record<string, number>)[e.key];
        if (!mv) return;
        e.preventDefault();
        const i = sel < 0 ? 0 : sel + mv;
        if (i >= 0 && i < 81 && !(Math.abs(mv) === 1 && ((i / 9) | 0) !== ((sel / 9) | 0))) {
          setSel(i);
          grid.current?.querySelector<HTMLElement>(`[data-su="${i}"]`)?.focus({ preventScroll: true });
        }
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const wrong = new Set(day.wrong), selV = sel >= 0 ? v[sel] : '0';
  const left = (n: number) => 9 - [...v].filter((x) => x === String(n)).length;
  return (
    <Sheet label="Daily sudoku" tall>
      <h2 className="sh-title">Daily sudoku</h2>
      <div className="pzmeta"><LevelDots n={day.level} /><span>Level {day.level} of 5</span><span id="pz-time">{P.fmtT(day.secs)}</span></div>
      {day.done && <ResultPanel g="su" />}
      <div className="sugrid" ref={grid}>
        {Array.from({ length: 81 }, (_, i) => {
          const r = (i / 9) | 0, c = i % 9, given = p.puzzle[i] !== '0', d = v[i];
          let clash = false;
          if (d !== '0') for (let j = 0; j < 81; j++) if (j !== i && v[j] === d && suPeers(i, j)) { clash = true; break; }
          const cls = ['suc', given ? 'given' : '', c % 3 === 2 && c < 8 ? 'br' : '', r % 3 === 2 && r < 8 ? 'bb' : '', sel >= 0 && !day.done && i !== sel && suPeers(i, sel) ? 'peer' : '', selV !== '0' && d === selV && i !== sel ? 'same' : '', i === sel && !day.done ? 'sel' : '', clash && !given ? 'clash' : '', wrong.has(String(i)) ? 'bad' : '', day.rev[i] ? 'rev' : ''].filter(Boolean).join(' ');
          const notes = day.notes[i];
          return (
            <button key={i} data-su={i} className={cls} onClick={() => setSel(i)} aria-label={`Row ${r + 1} column ${c + 1}${d !== '0' ? `, ${d}` : ', empty'}${given ? ', given' : ''}`}>
              {d !== '0' ? d : notes ? <span className="nt">{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <span key={n}>{notes.includes(String(n)) ? n : ''}</span>)}</span> : null}
            </button>
          );
        })}
      </div>
      {!day.done && (
        <>
          <div className="supad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} onClick={() => input(n)} disabled={left(n) <= 0} aria-label={String(n)}>{n}</button>)}
          </div>
          <div className="sutools">
            <button className="pill" onClick={() => act('notes')} aria-pressed={notesMode}>Notes {notesMode ? 'on' : 'off'}</button>
            <button className="pill" onClick={() => act('erase')}>Erase</button>
            <button className="pill" onClick={() => act('check')}>Check</button>
            <button className="pill" onClick={() => act('hint')}>Hint</button>
            <button className="pill" onClick={() => act('reveal')}>{confirming ? 'Sure? Tap again' : 'Reveal all'}</button>
          </div>
          <p className="muted sutip">Tap a square, then a number. Notes lets you pencil in options. Clashing numbers turn red.</p>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Rulebook

function Rulebook() {
  const { ed, toast } = useReader();
  const { puz, set } = usePuzzles();
  const day = puz.rb.day!;
  const fresh = isFresh(ed.issue);
  const p = useMemo(() => (fresh ? makeRulebookDaily(ed.date, headlineWords(ed.stories)) : makeRulebook(ed.date)), [fresh, ed.date, ed.stories]);
  const [msg, setMsg] = useState('');
  const [word, setWord] = useState('');
  const [confirming, confirm] = useConfirm();
  const inp = useRef<HTMLInputElement>(null);
  const n = day.tests.length, open = n >= RB_UNLOCK || !!day.done, out = n >= RB_MAX;
  const update = (fn: (d: P.RbDay) => P.RbDay) => set((s) => (s.rb.day ? { ...s, rb: { ...s.rb, day: fn(s.rb.day) } } : s));
  const scrollTop = () => document.querySelector('.sheet')?.scrollTo({ top: 0 });

  const test = (e: React.FormEvent) => {
    e.preventDefault();
    if (day.done) return;
    const w = word.trim().toLowerCase();
    if (!/^[a-z]{2,12}$/.test(w)) setMsg('Use 2 to 12 letters, A to Z only.');
    else if ([...p.given, ...day.tests].some((t) => t.w === w)) setMsg(`You've already tested ${w.toUpperCase()}.`);
    else if (n >= RB_MAX) setMsg('No tests left. Make your pick.');
    else {
      const ok = RB_RULES[p.secret].f(w);
      update((d) => ({ ...d, tests: [...d.tests, { w, ok }] }));
      setMsg(`${w.toUpperCase()} ${ok ? 'passes' : 'fails'}.${n + 1 >= RB_MAX ? ' That was your last test.' : n + 1 === RB_UNLOCK ? ' The rule list is now open.' : ''}`);
      setWord('');
    }
    inp.current?.focus({ preventScroll: true });
  };
  const pick = (i: number) => {
    if (day.done || day.wrong.includes(i)) return;
    if (i === p.secret) {
      update((d) => ({ ...d, done: 'solved' }));
      set((s) => ({ ...s, rb: { ...s.rb, solved: s.rb.solved + 1 } }));
      toast('You found the rule');
      track('puzzle_done', { game: 'rb', how: 'solved', tests: n, wrong: day.wrong.length });
      scrollTop();
    } else {
      const wrong = [...day.wrong, i], revealed = wrong.length >= p.opts.length - 1;
      update((d) => ({ ...d, wrong, done: revealed ? 'revealed' : d.done }));
      toast("Not that one. It's crossed off");
      if (revealed) { track('puzzle_done', { game: 'rb', how: 'revealed', tests: n }); scrollTop(); }
    }
  };
  const share = `Daily Receipts · Rulebook No. ${ed.issue}\n🧪 ${day.tests.map((t) => (t.ok ? '✅' : '❌')).join('') || 'no tests'}\n🎯 ${day.done === 'revealed' ? 'rule revealed' : day.wrong.length === 0 ? 'first pick' : `${day.wrong.length} wrong pick${day.wrong.length === 1 ? '' : 's'}`}`;
  const Row = ({ w, ok, given }: { w: string; ok: boolean; given?: boolean }) => (
    <li className={ok ? 'y' : 'n'}><span className="rbw">{w}</span>{given && <span className="rbg">example</span>}<span className="rbt">{ok ? '✓ Passes' : '✗ Fails'}</span></li>
  );
  return (
    <Sheet label="Rulebook" tall>
      <h2 className="sh-title">Rulebook</h2>
      <p className="stand">A secret rule decides which words pass. Test words to work it out, then pick it from the list.{fresh ? " Today's examples come from today's headlines." : ''}</p>
      {day.done && (
        <div className="pzdone" role="status">
          <h3>{day.done === 'revealed' ? "Here's the rule." : n <= 4 && day.wrong.length === 0 ? 'Sharp deduction.' : day.wrong.length === 0 ? 'Solved.' : 'Got there.'}</h3>
          <p>The rule was: {RB_RULES[p.secret].t.toLowerCase()}.{day.done === 'solved' ? ` You used ${n} ${n === 1 ? 'test' : 'tests'} and made ${day.wrong.length} wrong ${day.wrong.length === 1 ? 'pick' : 'picks'}.` : ''} A new rule comes with tomorrow&apos;s edition.</p>
          <ShareBox text={share} />
        </div>
      )}
      <div className="pzmeta"><span>No. {ed.issue}</span><span className="pzr">{n} / {RB_MAX} tests</span></div>
      <ul className="rblog">
        {p.given.map((e) => <Row key={`g${e.w}`} w={e.w} ok={e.ok} given />)}
        {day.tests.map((e) => <Row key={e.w} w={e.w} ok={e.ok} />)}
      </ul>
      {!day.done && (
        <>
          <form className="rbform" onSubmit={test} noValidate>
            <input ref={inp} type="text" maxLength={12} autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false}
              placeholder={out ? 'No tests left' : 'Type a word'} aria-label="Word to test" disabled={out} value={word} onChange={(e) => setWord(e.target.value)} />
            <button className="pill solid" type="submit" disabled={out}>Test</button>
          </form>
          <p className="muted" role="status">{msg || 'Any letters count, but real words make it easier to think.'}</p>
        </>
      )}
      <h4>Which rule is it?</h4>
      {open ? (
        <div className="rbrules">
          {p.opts.map((i) => {
            const wrong = day.wrong.includes(i), right = !!day.done && i === p.secret;
            return <button key={i} className={`rbrule${wrong ? ' wrong' : ''}${right ? ' right' : ''}`} onClick={() => pick(i)} disabled={wrong || !!day.done}>{RB_RULES[i].t}</button>;
          })}
        </div>
      ) : <p className="muted">The list unlocks after {RB_UNLOCK} tests ({RB_UNLOCK - n} to go).</p>}
      {!day.done && (
        <>
          <p className="muted">Tip: test words you expect to fail. Confirming what you already think teaches you very little.</p>
          <div className="pzbtns">
            <button className="pill" onClick={() => {
              if (!confirm()) return;
              update((d) => ({ ...d, done: 'revealed' }));
              track('puzzle_done', { game: 'rb', how: 'revealed', tests: n });
              scrollTop();
            }}>{confirming ? 'Sure? Tap again' : 'Show me the rule'}</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Sure?

function Sure() {
  const { ed } = useReader();
  const { puz, set } = usePuzzles();
  const day = puz.sr.day!;
  const qs = useMemo(() => sureQuestions(ed), [ed]);
  const newsN = qs.filter((x) => x.news).length;
  const [lo, setLo] = useState('');
  const [hi, setHi] = useState('');
  const [msg, setMsg] = useState('');
  const update = (fn: (d: P.SrDay) => P.SrDay) => set((s) => (s.sr.day ? { ...s, sr: { ...s.sr, day: fn(s.sr.day) } } : s));
  const scrollTop = () => document.querySelector('.sheet')?.scrollTo({ top: 0 });

  const dots = (
    <div className="srdots" aria-hidden="true">
      {qs.map((_, k) => <i key={k} className={day.res[k] ? (day.res[k].hit ? 'hit' : 'miss') : k === day.i && !day.done ? 'now' : ''} />)}
    </div>
  );

  if (day.done) {
    const hits = day.res.filter((r) => r.hit).length, pts = day.res.reduce((a, r) => a + r.pts, 0);
    const verdict = hits === 5 ? 'Five out of five may mean your ranges are wider than they need to be. Try tightening tomorrow.'
      : hits === 4 ? 'Right on target. A well-calibrated 90% catches 4 or 5 out of 5 on most days.'
      : hits === 3 ? 'A bit overconfident. Your ranges are narrower than your knowledge.'
      : 'Overconfident. Your 90% is behaving more like 50%. Widen your ranges.';
    const share = `Daily Receipts · Sure? No. ${ed.issue}\n${day.res.map((r) => (r.hit ? '🎯' : '❌')).join('')}  ${hits}/5 inside\n${pts} pts`;
    return (
      <Sheet label="Sure?" tall>
        <h2 className="sh-title">Sure?</h2>
        {dots}
        <div className="pzdone" role="status">
          <h3>{hits} of 5 inside your range</h3>
          <div className="srstats">
            <div><b>{pts}</b><span>points of 500</span></div>
            <div><b>{hits * 20}%</b><span>hit rate today</span></div>
            <div><b>{puz.sr.n ? `${Math.round((puz.sr.h / puz.sr.n) * 100)}%` : '—'}</b><span>all-time, aim 90%</span></div>
          </div>
          <p>{verdict} New questions come with tomorrow&apos;s edition.</p>
          <ShareBox text={share} />
        </div>
        <h4>Today&apos;s answers</h4>
        <ul className="plain">
          {day.res.map((r, k) => (
            <li key={k}>{qs[k]?.q} <strong>{srFmt(r.x)}</strong> <span className="muted">· you said {srFmt(r.l)} to {srFmt(r.u)} · {r.hit ? 'inside' : 'outside'} · +{r.pts}</span></li>
          ))}
        </ul>
        <p className="muted">Scoring uses the interval score: you pay the width of your range, plus 20 times how far outside it the answer fell. Over time, the best strategy is ranges that really do catch the answer 90% of the time.</p>
      </Sheet>
    );
  }

  const q = qs[day.i];
  if (day.stage === 'ask') {
    const lock = (e: React.FormEvent) => {
      e.preventDefault();
      let l = srNum(lo), u = srNum(hi);
      if (!Number.isFinite(l) || !Number.isFinite(u)) { setMsg('Enter a number in both boxes.'); return; }
      if (l > u) [l, u] = [u, l];
      const x = q.x;
      update((d) => {
        const res = d.res.slice();
        res[d.i] = { l, u, x, hit: x >= l && x <= u, pts: srScore(l, u, x, q.sc) };
        return { ...d, res, stage: 'reveal' };
      });
      setLo(''); setHi(''); setMsg('');
    };
    return (
      <Sheet label="Sure?" tall>
        <h2 className="sh-title">Sure?</h2>
        <p className="stand">Five real numbers{newsN ? `, ${newsN === 1 ? 'one' : 'two'} from today\u2019s news` : ''}. For each, give a range you&apos;re 90% sure contains the answer. Tight ranges score more, but a miss costs a lot.</p>
        {dots}
        <div className="pzmeta"><span>Question {day.i + 1} of {SR_N}</span><span className="pzr">No. {ed.issue}</span></div>
        {q.news && <p className="srtag">From today&apos;s news<span>{q.head}</span></p>}
        <p className="srq">{q.q}</p>
        <p className="muted">{q.news ? 'Fill in the missing number.' : q.unit ? `Answer in ${q.unit}.` : 'Answer with a number.'}</p>
        <form onSubmit={lock} noValidate>
          <p className="srprompt">I&apos;m 90% sure it&apos;s between…</p>
          <div className="srin">
            <label htmlFor="sr-lo">Low<input id="sr-lo" inputMode="decimal" autoComplete="off" value={lo} onChange={(e) => setLo(e.target.value)} autoFocus /></label>
            <span>and</span>
            <label htmlFor="sr-hi">High<input id="sr-hi" inputMode="decimal" autoComplete="off" value={hi} onChange={(e) => setHi(e.target.value)} /></label>
          </div>
          <p className="muted srmsg" role="status">{msg}</p>
          <button className="pill solid" type="submit">Lock it in</button>
        </form>
      </Sheet>
    );
  }

  const r = day.res[day.i];
  const a0 = Math.min(r.l, r.x), b0 = Math.max(r.u, r.x), pad = (b0 - a0 || Math.abs(r.x) || 1) * 0.15;
  const a = a0 - pad, b = b0 + pad, pos = (x: number) => `${(((x - a) / (b - a)) * 100).toFixed(2)}%`;
  const last = day.i === SR_N - 1;
  const next = () => {
    if (last) {
      const hits = day.res.filter((x) => x.hit).length;
      set((s) => ({ ...s, sr: { ...s.sr, n: s.sr.n + SR_N, h: s.sr.h + hits, day: { ...s.sr.day!, done: 'done' } } }));
      track('puzzle_done', { game: 'sr', how: 'solved', hits, pts: day.res.reduce((t, x) => t + x.pts, 0) });
    } else update((d) => ({ ...d, i: d.i + 1, stage: 'ask' }));
    scrollTop();
  };
  return (
    <Sheet label="Sure?" tall>
      <h2 className="sh-title">Sure?</h2>
      {dots}
      <div className="pzmeta"><span>Question {day.i + 1} of {SR_N}</span><span className="pzr">No. {ed.issue}</span></div>
      {q.news && <p className="srtag">From today&apos;s news<span>{q.head}</span></p>}
      <p className="srq">{q.q}</p>
      <div className="srline" role="img" aria-label={`Your range ${srFmt(r.l)} to ${srFmt(r.u)}; the answer is ${srFmt(r.x)}`}>
        <div className="ax" />
        <div className="bd" style={{ left: pos(r.l), width: `calc(${pos(r.u)} - ${pos(r.l)})` }} />
        <div className="tr" style={{ left: pos(r.x) }} />
        <span className="lb t" style={{ left: pos(r.x) }}>{srFmt(r.x)}</span>
        <span className="lb b" style={{ left: pos(r.l) }}>{srFmt(r.l)}</span>
        {r.u !== r.l && <span className="lb b" style={{ left: pos(r.u) }}>{srFmt(r.u)}</span>}
      </div>
      <div className="srverdict"><b className={r.hit ? '' : 'miss'}>{r.hit ? 'Inside your range' : 'Outside your range'}</b><span>+{r.pts} pts</span></div>
      <p className="muted">{q.note}</p>
      <div className="pzbtns"><button className="pill solid" onClick={next}>{last ? 'See my results' : 'Next question'}</button></div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- entry points

export function GameSheet({ game }: { game: P.Game }) {
  const ready = useToday(game);
  if (!ready) return null;
  if (game === 'cw') return <Crossword />;
  if (game === 'su') return <Sudoku />;
  if (game === 'rb') return <Rulebook />;
  return <Sure />;
}

/** Settings rows: switch each puzzle on or off. */
export function PuzzleSettings() {
  const { puz, set } = usePuzzles();
  const { toast } = useReader();
  return (
    <>
      {P.GAMES.map((g) => (
        <div className="tgl" key={g}>
          <span>{P.NAMES[g]}<small>{!puz.on[g] ? 'Switched off' : P.LEVELLED(g) ? `Level ${puz[g as 'cw' | 'su'].level} of 5 · gets harder as you improve` : P.BLURB[g]}</small></span>
          <button className="switch" role="switch" aria-checked={puz.on[g]} aria-label={`Daily ${P.NAMES[g].toLowerCase()}`} onClick={() => {
            set((s) => ({ ...s, on: { ...s.on, [g]: !s.on[g] } }));
            toast(`${P.NAMES[g]} ${puz.on[g] ? 'off' : 'on'}`);
          }} />
        </div>
      ))}
    </>
  );
}
