import edition from '../../../data/edition-2026-10-07.json';
import { validateEdition } from '../validateEdition';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Edition } from '../../types/edition';
import { prepareEdition } from '../prepareEdition';

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

describe('"Also reported by" links', () => {
  const base = prepareEdition(JSON.parse(readFileSync(join(__dirname, '../../../data/edition-2026-10-15.json'), 'utf8')) as Edition).edition;
  const s = base.stories[0];
  const inSrc = new Set(s.src.map(([k]) => k));
  // real links from other stories in the same edition, from outlets this story doesn't cite
  const others = [...new Map(base.stories.flatMap((t) => t.src).filter(([k]) => !inSrc.has(k)).map(([k, u]) => [k, u] as [string, string])).entries()];

  it('keeps good links, upgrades http, and drops unknown outlets, outlets already cited, repeats and extras', () => {
    const e = structuredClone(base);
    const [a, b] = others;
    e.stories[0].also = [
      [a[0], a[1].replace('https://', 'http://')],
      [a[0], a[1]],
      ['no-such-outlet', a[1]],
      [s.src[0][0], b[1]],
      [b[0], b[1]],
      ...others.slice(2, 12),
    ];
    const { edition, notes } = prepareEdition(e);
    const also = edition.stories[0].also!;
    expect(also[0]).toEqual([a[0], a[1]]);
    expect(also[1]).toEqual([b[0], b[1]]);
    expect(also.length).toBe(8);
    expect(new Set(also.map((x) => x[0])).size).toBe(8);
    expect(notes.filter((n) => n.includes('dropped also link')).length).toBeGreaterThanOrEqual(3);
    expect(validateEdition(edition)).toEqual({ ok: true, errors: [] });
  });

  it('the validator rejects malformed links that skipped the clean-up', () => {
    const e = structuredClone(base);
    (e.stories[0] as unknown as { also: unknown }).also = [['nope', 'http://x.example']];
    const r = validateEdition(e);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/also\[0\] outlet "nope" is not in outlets/);
  });
});
