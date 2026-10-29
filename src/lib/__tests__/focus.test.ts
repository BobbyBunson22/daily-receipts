import edition from '../../../data/edition-2026-10-29.json';
import type { Edition } from '../../types/edition';
import { FOCUSES, backers, focusFor, sameFact } from '../focus/focus';
import { gradeStory } from '../grading';
import { prepareEdition } from '../prepareEdition';
import type { ClientStory } from '../reader/types';

// The real edition No. 21 (Thursday 29 October 2026), graded with the shared formula.
const prepared = prepareEdition(structuredClone(edition) as unknown as Edition).edition;
const stories = prepared.stories.map((s, i) => {
  const g = gradeStory(s);
  return {
    ...s, id: i + 1, slug: s.id, src: s.src.map(([key, url]) => ({ key, url, name: key, country: '' })),
    sources: g.sources, score: g.score, grade: g.grade, importance: g.importance,
  } as unknown as ClientStory;
});
const ed = { issue: prepared.edition.issue, stories };

describe('focus receipts', () => {
  it('reads support counts', () => {
    expect(backers('3 of 3 outlets')).toBe(3);
    expect(backers('1 of 2 outlets')).toBe(1);
    expect(backers('official figures')).toBe(0);
  });

  it('spots two facts that say the same thing', () => {
    expect(sameFact('VAT stays off household electricity until mid-2027', 'The VAT cut on household electricity bills is extended to July 2027')).toBe(true);
    expect(sameFact('The OBR cut its 2027 UK growth forecast to 1%', 'NHS England gets an extra £190m in 2026-27 for winter pressures')).toBe(false);
  });

  it('every focus story exists in its edition', () => {
    const def = FOCUSES.find((d) => d.issue === 21)!;
    for (const slug of def.stories) expect(stories.some((s) => s.slug === slug)).toBe(true);
  });

  it('builds the Budget receipt only from kept facts backed by two or more outlets', () => {
    const f = focusFor(ed)!;
    expect(f.title).toBe('UK Budget');
    expect(f.lines.length).toBeGreaterThanOrEqual(4);
    expect(f.lines.length).toBeLessThanOrEqual(8);
    for (const l of f.lines) {
      // word for word from the story it links to, with the story's own support count
      expect(l.story.kept).toContainEqual([l.fact, l.support]);
      expect(backers(l.support)).toBeGreaterThanOrEqual(2);
    }
    // the lead story comes first, and nothing is said twice
    expect(f.lines[0].story.slug).toBe('pol-budget-healey-delivered');
    f.lines.forEach((a, i) => f.lines.slice(i + 1).forEach((b) => expect(sameFact(a.fact, b.fact)).toBe(false)));
    // the floor grade is computed from the stories, never set by hand
    expect(f.floor).toBe(f.lines.map((l) => l.story.grade).sort().pop());
  });

  it('shows on its own edition only', () => {
    expect(focusFor({ ...ed, issue: 22 })).toBeNull();
  });

  it('stays away when too little is well supported', () => {
    const thin = stories.map((s) => ({ ...s, kept: s.kept.map(([f]) => [f, '1 of 2 outlets'] as [string, string]) }));
    expect(focusFor({ issue: 21, stories: thin })).toBeNull();
  });
});

