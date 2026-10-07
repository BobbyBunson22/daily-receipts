import edition from '../../../data/edition-2026-10-07.json';
import type { Edition } from '../../types/edition';
import { gradeFor, gradeStory, importanceFor, scoreFor, spreadFor } from '../grading';

const data = edition as unknown as Edition;

describe('spreadFor', () => {
  it.each([
    [1, 25],
    [2, 50],
    [3, 70],
    [4, 85],
    [9, 85],
  ])('%i sources → %i', (n, spread) => expect(spreadFor(n)).toBe(spread));
});

describe('gradeFor', () => {
  it.each([
    [100, 'A'],
    [85, 'A'],
    [84, 'B'],
    [70, 'B'],
    [69, 'C'],
    [55, 'C'],
    [54, 'D'],
    [0, 'D'],
  ])('score %i → %s', (score, grade) => expect(gradeFor(score)).toBe(grade));
});

describe('scoreFor', () => {
  it('weights the four meters 30/35/15/20', () => {
    // 0.30×80 + 0.35×60 + 0.15×70 + 0.20×50 = 24 + 21 + 10.5 + 10 = 65.5 → 66
    expect(scoreFor([80, 60, 50], 3)).toBe(66);
  });
  it('tops out at 98 because source spread caps at 85', () => {
    expect(scoreFor([100, 100, 100], 4)).toBe(98);
  });
});

describe('importanceFor', () => {
  it('is sources × 10 + score / 10', () => expect(importanceFor(3, 74)).toBeCloseTo(37.4));
});

describe('the 7 October 2026 edition', () => {
  it('has a precomputed grade for every story', () => {
    expect(data.computed.map((c) => c.id).sort()).toEqual(data.stories.map((s) => s.id).sort());
  });

  it.each(data.computed.map((c) => [c.id, c] as const))(
    '%s matches the prototype’s published grade',
    (id, expected) => {
      const story = data.stories.find((s) => s.id === id)!;
      const g = gradeStory(story);
      expect({ score: g.score, grade: g.grade }).toEqual({
        score: expected.score,
        grade: expected.grade,
      });
    },
  );

  it('uses the same formula constants the edition declares', () => {
    expect(data.grading.weights).toEqual({
      corroboration: 0.3,
      primaryRecords: 0.35,
      sourceSpread: 0.15,
      stability: 0.2,
    });
    expect(data.grading.spread).toEqual({ '1': spreadFor(1), '2': spreadFor(2), '3': spreadFor(3), '4+': spreadFor(4) });
    expect(data.grading.bands).toEqual({ A: 85, B: 70, C: 55, D: 0 });
  });
});
