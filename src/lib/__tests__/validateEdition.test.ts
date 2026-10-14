import edition from '../../../data/edition-2026-10-07.json';
import { validateEdition } from '../validateEdition';

const clone = (): any => JSON.parse(JSON.stringify(edition));

describe('validateEdition', () => {
  it('accepts the real 7 October 2026 edition', () => {
    const result = validateEdition(edition);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects something that is not an edition', () => {
    expect(validateEdition(null).ok).toBe(false);
    expect(validateEdition([]).ok).toBe(false);
  });

  it('rejects a story with no sources', () => {
    const e = clone();
    e.stories[0].src = [];
    expect(validateEdition(e).errors).toContain(`stories[0] (${e.stories[0].id}): src must list at least one source`);
  });

  it('rejects a source from an outlet that is not listed', () => {
    const e = clone();
    e.stories[0].src[0][0] = 'not-an-outlet';
    expect(validateEdition(e).ok).toBe(false);
  });

  it('rejects a non-https source link', () => {
    const e = clone();
    e.stories[0].src[0][1] = 'http://example.com/story';
    expect(validateEdition(e).ok).toBe(false);
  });

  it('rejects meters outside 0-100', () => {
    const e = clone();
    e.stories[0].m = [85, 101, 60];
    expect(validateEdition(e).ok).toBe(false);
  });

  it('rejects a sub that is not in its section', () => {
    const e = clone();
    e.stories[0].sub = 'Football';
    expect(validateEdition(e).ok).toBe(false);
  });

  it('rejects duplicate story ids', () => {
    const e = clone();
    e.stories[1].id = e.stories[0].id;
    expect(validateEdition(e).ok).toBe(false);
  });

  it('rejects a story with no kept facts', () => {
    const e = clone();
    e.stories[0].kept = [];
    expect(validateEdition(e).ok).toBe(false);
  });

  it('rejects a precomputed grade that disagrees with the formula', () => {
    const e = clone();
    e.computed[0].grade = 'A';
    expect(validateEdition(e).ok).toBe(false);
  });
});
