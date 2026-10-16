/** Feed parsing and story grouping, using real headlines and standfirsts from data/edition-2026-10-15.json. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { clusterItems, keywords, parseFeed, type FeedItem } from '../feeds';

const ed = JSON.parse(readFileSync(join(__dirname, '../../../data/edition-2026-10-15.json'), 'utf8')) as { stories: { id: string; head: string; stand: string; src: string[][] }[] };
const [s1, s2, s3] = ed.stories;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

describe('parseFeed', () => {
  it('reads RSS 2.0, with CDATA, entities and dates', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
      <item><title><![CDATA[${s1.head}]]></title><link>${s1.src[0][1]}</link><pubDate>Thu, 15 Oct 2026 05:00:00 GMT</pubDate></item>
      <item><title>${esc(s2.head)}</title><link>${esc(s2.src[0][1])}</link></item>
    </channel></rss>`;
    const out = parseFeed(xml);
    expect(out).toEqual([
      { t: s1.head, u: s1.src[0][1], at: '2026-10-15T05:00:00.000Z' },
      { t: s2.head, u: s2.src[0][1], at: null },
    ]);
  });

  it('reads Atom and RSS 1.0 (RDF)', () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="html">${esc(s3.head)}</title>
      <link rel="alternate" href="${esc(s3.src[0][1])}"/><updated>2026-10-15T06:10:00Z</updated></entry></feed>`;
    expect(parseFeed(atom)).toEqual([{ t: s3.head, u: s3.src[0][1], at: '2026-10-15T06:10:00.000Z' }]);
    const rdf = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <item><title>${esc(s1.head)}</title><link>${s1.src[0][1]}</link><dc:date>2026-10-15T04:00:00Z</dc:date></item></rdf:RDF>`;
    expect(parseFeed(rdf)[0].t).toBe(s1.head);
  });

  it('skips items with no title or no web link', () => {
    expect(parseFeed(`<rss><channel><item><title>${esc(s1.head)}</title></item><item><link>https://x.example/a</link></item></channel></rss>`)).toEqual([]);
  });
});

describe('grouping headlines into stories', () => {
  it('flags names but not the first word', () => {
    const k = keywords(s1.head);
    expect([...k.keys()].length).toBeGreaterThan(2);
    expect(k.get(s1.head.split(' ')[0].toLowerCase()) ?? -1).toBe(-1);
    // "Strait of Hormuz": Strait and Hormuz are names
    expect(k.get('strait')).toBeGreaterThan(0);
  });

  it("joins a story's headline and standfirst from two outlets, and keeps different stories apart", () => {
    const items: FeedItem[] = [];
    ed.stories.slice(0, 12).forEach((s) => {
      items.push({ o: 'a', t: s.head, u: `https://a.example/${s.id}`, at: null, lang: 'en' });
      items.push({ o: 'b', t: s.stand, u: `https://b.example/${s.id}`, at: null, lang: 'en' });
    });
    const cs = clusterItems(items, { a: 'uk', b: 'us' });
    // every cluster holds one story only
    for (const c of cs) expect(new Set(c.items.map((x) => x.u.split('/').pop())).size).toBe(1);
    // the pair sharing two names is found (Greenland: Trump and Greenland)
    const found = cs.map((c) => c.items[0].u.split('/').pop());
    expect(found).toContain(ed.stories[6].id);
    expect(cs.every((c) => c.outlets.length === 2 && c.groups.length === 2)).toBe(true);
  });

  it('never joins two headlines from the same outlet on their own', () => {
    const items: FeedItem[] = [
      { o: 'a', t: s1.head, u: 'https://a.example/1', at: null, lang: 'en' },
      { o: 'a', t: s1.stand, u: 'https://a.example/2', at: null, lang: 'en' },
    ];
    expect(clusterItems(items, { a: 'uk' })).toEqual([]);
  });
});
