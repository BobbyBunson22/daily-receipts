import { FACTS, QUESTIONS } from '../content';
import { answer, check, dayNumber, distance, emptyDaily, factFor, goldStreak, mergeDaily, normalise, normaliseDaily, questionFor, tokens } from '../daily';

const q = (text: string) => QUESTIONS.find((x) => x.q.startsWith(text))!;

describe('today\'s pick', () => {
  it('a new fact and question each day, with no repeats for over three months', () => {
    const days = Array.from({ length: 100 }, (_, i) => new Date(Date.UTC(2026, 9, 17 + i)).toISOString().slice(0, 10));
    expect(new Set(days.map(factFor)).size).toBe(100);
    expect(new Set(days.map((d) => questionFor(d).q)).size).toBe(100);
    expect(dayNumber('2026-01-01')).toBe(0);
    expect(dayNumber('2026-10-17')).toBe(289);
  });

  it('the content is well formed', () => {
    expect(FACTS.length).toBeGreaterThanOrEqual(100);
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(FACTS).size).toBe(FACTS.length);
    expect(new Set(QUESTIONS.map((x) => x.q)).size).toBe(QUESTIONS.length);
    for (const x of QUESTIONS) {
      expect(x.q.endsWith('?')).toBe(true);
      expect(x.a.length).toBeGreaterThan(0);
      // every accepted answer is accepted, and no wrong near-miss is
      for (const a of x.a) expect(check(a, x).ok).toBe(true);
      for (const n of x.not ?? []) expect(check(n, x).ok).toBe(false);
    }
  });
});

describe('checking an answer', () => {
  it('forgives typos, capitals, accents, spaces and "the"', () => {
    expect(check('canbera', q('What is the capital of Australia')).ok).toBe(true);
    expect(check('CANBERRA ', q('What is the capital of Australia'))).toEqual({ ok: true, exact: true, answer: 'Canberra' });
    expect(check('Edinbrugh', q('What is the capital of Scotland')).ok).toBe(true);
    expect(check('the milky way', q('What is the name of our galaxy')).ok).toBe(true);
    expect(check('milkyway', q('What is the name of our galaxy')).ok).toBe(true);
    expect(check('Leonardo Da Vinchi', q('Who painted the Mona Lisa')).ok).toBe(true);
    expect(check('Deoxyribonucleic acide', q('What does DNA stand for')).ok).toBe(true);
    expect(check('Peru', q('In which country would you find Machu Picchu')).ok).toBe(true);
    expect(check('Perú', q('In which country would you find Machu Picchu')).ok).toBe(true);
  });

  it('says when a spelling was accepted rather than exact', () => {
    expect(check('Jupitor', q('What is the largest planet'))).toEqual({ ok: true, exact: false, answer: 'Jupiter' });
  });

  it('is strict with numbers, short answers and real near-misses', () => {
    expect(check('1913', q('In which year did the Titanic sink')).ok).toBe(false);
    expect(check('1912', q('In which year did the Titanic sink')).ok).toBe(true);
    expect(check('six', q('How many sides does a hexagon')).ok).toBe(true);
    expect(check('5', q('How many sides does a hexagon')).ok).toBe(false);
    expect(check('Ag', q('What is the chemical symbol for gold')).ok).toBe(false);
    expect(check('Austria', q('In which country does the duck-billed platypus')).ok).toBe(false);
    expect(check('Sydney', q('What is the capital of Australia')).ok).toBe(false);
    expect(check('Hydrogen', q('Which gas makes up about 78%')).ok).toBe(false);
    expect(check('Venus', q('Which planet is closest to the Sun')).ok).toBe(false);
    expect(check('', q('Which planet is closest to the Sun')).ok).toBe(false);
  });

  it('normalises and measures slips', () => {
    expect(normalise('  The Thames! ')).toBe('thames');
    expect(normalise('Ten')).toBe('10');
    expect(distance('teh', 'the')).toBe(1);
    expect(distance('kitten', 'sitting')).toBe(3);
  });
});

describe('gold DR tokens', () => {
  it('one answer per day; each correct day is a token', () => {
    let st = emptyDaily();
    st = answer(st, '2026-10-15', 'correct');
    st = answer(st, '2026-10-16', 'dontknow');
    st = answer(st, '2026-10-17', 'correct');
    st = answer(st, '2026-10-17', 'wrong');
    expect(st.ans['2026-10-17']).toBe('correct');
    expect(tokens(st)).toBe(2);
  });

  it('counts a streak of correct days up to today, even before today is answered', () => {
    let st = emptyDaily();
    for (const d of ['2026-10-14', '2026-10-15', '2026-10-16']) st = answer(st, d, 'correct');
    expect(goldStreak(st, '2026-10-17')).toBe(3);
    expect(goldStreak(answer(st, '2026-10-17', 'correct'), '2026-10-17')).toBe(4);
    expect(goldStreak(answer(st, '2026-10-17', 'wrong'), '2026-10-17')).toBe(0);
  });

  it('merges the account with this browser, and survives damaged storage', () => {
    const local = answer(emptyDaily(), '2026-10-17', 'correct');
    const m = mergeDaily(local, [{ day: '2026-10-16', result: 'correct' }]);
    expect(tokens(m)).toBe(2);
    expect(normaliseDaily({ seen: 5, ans: { bad: 'correct', '2026-10-17': 'nope', '2026-10-16': 'wrong' } })).toEqual({ seen: '', ans: { '2026-10-16': 'wrong' } });
  });
});
