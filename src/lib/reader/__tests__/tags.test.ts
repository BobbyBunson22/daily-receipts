/** Story tags, on real headlines and facts from data/edition-2026-10-20.json. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Edition } from '../../../types/edition';
import { prepareEdition } from '../../prepareEdition';
import { validateEdition } from '../../validateEdition';
import { MAX_TAGS, deriveTags, names, tagKey } from '../tags';

const ed = JSON.parse(readFileSync(join(__dirname, '../../../../data/edition-2026-10-20.json'), 'utf8')) as Edition;
const find = (start: string) => ed.stories.findIndex((s) => s.head.startsWith(start));

describe('story tags', () => {
  const tags = deriveTags(ed.stories);

  it('every story gets tags, at most eight', () => {
    expect(tags.every((t) => t.length > 0 && t.length <= MAX_TAGS)).toBe(true);
  });

  it('finds the people, places and organisations a story is about', () => {
    expect(tags[find('Trump defends Russia sanctions')]).toEqual(expect.arrayContaining(['Trump', 'Russia']));
    expect(tags[find('Lula narrows')]).toEqual(expect.arrayContaining(['Flávio Bolsonaro', 'Brazil']));
    expect(tags[find('Barclays shares fall')]).toEqual(expect.arrayContaining(['Barclays']));
  });

  it('a full name also tags the surname, so "Donald Trump" and "Trump" meet', () => {
    expect(tags[find('Kenyan cult leader')]).toEqual(expect.arrayContaining(['Paul Mackenzie', 'Mackenzie']));
  });

  it('ignores ordinary words that start a sentence, and ends a name at a possessive', () => {
    const all = tags.flat();
    for (const w of ['Hundreds', 'About', 'Some', 'Three']) expect(all).not.toContain(w);
    expect(tags[find("Florida issues arrest warrant for Cuba's")]).toEqual(expect.arrayContaining(['Raúl Castro', 'Cuba']));
    expect(names("Cuba's Raúl Castro")).toEqual(['Cuba', 'Raúl Castro']);
  });

  it('uses the edition\'s own tags when it has them', () => {
    const own = structuredClone(ed.stories.slice(0, 2));
    own[0].tags = ['Interest rates', 'Bank of England'];
    expect(deriveTags(own)[0]).toEqual(['Interest rates', 'Bank of England']);
  });

  it('keys ignore case, accents and punctuation', () => {
    expect(tagKey('Flávio Bolsonaro')).toBe('flavio bolsonaro');
    expect(tagKey("Trump's")).toBe('trump');
  });

  it('tags are cleaned before validation, and bad ones never fail an edition', () => {
    const e = structuredClone(ed);
    (e.stories[0] as unknown as { tags: unknown }).tags = ['Gaza', 'gaza', ' UN ', 7, 'x', 'A very long tag that goes on and on past forty characters'];
    const { edition } = prepareEdition(e);
    expect(edition.stories[0].tags).toEqual(['Gaza', 'UN']);
    expect(validateEdition(edition).ok).toBe(true);
  });
});
