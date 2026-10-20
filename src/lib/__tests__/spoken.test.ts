import edition from '../../../data/edition-2026-10-20.json';
import type { Story } from '../../types/edition';
import { prepareEdition } from '../prepareEdition';
import { checkSpoken } from '../spoken';
import fixtures from './fixtures/spoken-2026-10-20.json';

const story = (id: string) => structuredClone(edition.stories.find((s) => s.id === id)) as unknown as Story;

// Written for the ear from the real reports: same facts, attribution first. Also used by
// scripts/voice/compare.py to record comparison clips.
const LEEDS_SPOKEN = fixtures['sp-leeds-manutd'];
const FTSE_SPOKEN = fixtures['biz-ftse-falls'];

describe('spoken scripts', () => {
  it('a faithful rewrite for the ear passes', () => {
    expect(checkSpoken({ ...story('sp-leeds-manutd'), spoken: LEEDS_SPOKEN })).toEqual([]);
    expect(checkSpoken({ ...story('biz-ftse-falls'), spoken: FTSE_SPOKEN })).toEqual([]);
  });

  it('rejects a number, name or quote the story does not have', () => {
    const s = story('sp-leeds-manutd');
    const bad = (line: string) => checkSpoken({ ...s, spoken: [...LEEDS_SPOKEN.slice(0, 3), line] });
    expect(bad('Michael Carrick said his side had lost 3 of their last 4.')).toEqual(expect.arrayContaining(['number 3 is not in the story', 'number 4 is not in the story']));
    expect(bad('Sir Alex Ferguson was watching from the stands.')).toEqual(expect.arrayContaining(['name "Alex" is not in the story', 'name "Ferguson" is not in the story']));
    expect(bad('Carrick said: “We are in a crisis and everyone knows it.”')).toEqual([expect.stringMatching(/^quote "We are in a crisis/)]);
    expect(bad('Thousands of fans left before the end.')).toEqual(['"thousands" is not in the story']);
    expect(checkSpoken({ ...s, spoken: 'not a list' })).toEqual(['spoken must be 1 to 10 paragraphs of text']);
    expect(checkSpoken({ ...s, spoken: [s.body.join(' ').repeat(3)] })[0]).toMatch(/much longer than the report/);
  });

  it('an edition with a bad script still loads, reading the written report instead', () => {
    const ed = structuredClone(edition) as unknown as { stories: Story[] };
    ed.stories.find((s) => s.id === 'sp-leeds-manutd')!.spoken = [...LEEDS_SPOKEN, 'Ferguson watched on.'];
    ed.stories.find((s) => s.id === 'biz-ftse-falls')!.spoken = FTSE_SPOKEN;
    const { edition: out, notes } = prepareEdition(ed as never);
    expect(out.stories.find((s) => s.id === 'sp-leeds-manutd')!.spoken).toBeUndefined();
    expect(out.stories.find((s) => s.id === 'biz-ftse-falls')!.spoken).toEqual(FTSE_SPOKEN);
    expect(notes.some((n) => n.startsWith('sp-leeds-manutd: dropped spoken script'))).toBe(true);
  });
});
