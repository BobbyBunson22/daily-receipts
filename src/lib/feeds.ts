/**
 * Reading outlets' RSS and Atom feeds, and grouping headlines that look like the same story.
 * Headlines and links only: nothing here reads article text. Framework-free, used by
 * scripts/fetch-feeds.ts (the "Fetch feeds" GitHub Action).
 */
import { XMLParser } from 'fast-xml-parser';

export interface FeedOutlet {
  key: string;
  name: string;
  group: string;
  country: string;
  lang: string;
  lean: string;
  feeds: string[];
}

export interface FeedItem { o: string; t: string; u: string; at: string | null; lang: string }

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', htmlEntities: true, trimValues: true });

const text = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return text(o['#text'] ?? o['@href'] ?? '');
  }
  return '';
};
const list = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const clean = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function linkOf(e: Record<string, unknown>): string {
  const l = e.link;
  if (typeof l === 'string') return l.trim();
  for (const x of list(l as Record<string, unknown> | Record<string, unknown>[])) {
    if (x && typeof x === 'object' && (!x['@rel'] || x['@rel'] === 'alternate') && x['@href']) return String(x['@href']);
  }
  return text(e.guid).startsWith('http') ? text(e.guid) : '';
}

function dateOf(e: Record<string, unknown>): string | null {
  const raw = text(e.pubDate ?? e['dc:date'] ?? e.published ?? e.updated ?? e.date);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Headlines from an RSS 2.0, RSS 1.0 (RDF) or Atom document. */
export function parseFeed(xml: string): { t: string; u: string; at: string | null }[] {
  const doc = parser.parse(xml) as Record<string, Record<string, unknown>>;
  const entries = [
    ...list((doc.rss?.channel as Record<string, unknown> | undefined)?.item as Record<string, unknown>[]),
    ...list(doc['rdf:RDF']?.item as Record<string, unknown>[]),
    ...list(doc.feed?.entry as Record<string, unknown>[]),
  ];
  return entries
    .map((e) => ({ t: clean(text(e.title)), u: linkOf(e), at: dateOf(e) }))
    .filter((x) => x.t && /^https?:\/\//.test(x.u));
}

// ------------------------------------------------------------- grouping into stories

const STOP = new Set(`
about above after again against amid among also around away back been before being below between
both could does down during each even ever every first from have here into just last later least
like made make many more most much must near never next only onto other over said says same since
some still such than that their them then there these they this those through told under until
upon very want week were what when where which while will with within without would year years
today live latest update updates news watch video what's here's says amid first make
para como pero sobre entre desde hasta este esta estos estas tras ante cuando donde porque
tiene tienen será sido fueron puede pueden según años nuevo nueva más hace contra durante
`.split(/\s+/));

const words = (t: string) => t.match(/[\p{L}][\p{L}'’-]*/gu) ?? [];

/** Significant words in a headline, with names (capitalised, not the first word) flagged. */
export function keywords(title: string) {
  const ws = words(title);
  const keys = new Map<string, boolean>();
  ws.forEach((w, i) => {
    const base = w.replace(/['’]s$/i, '').toLowerCase();
    if (base.length < 4 || STOP.has(base)) return;
    const k = base.replace(/(?<=\w{4})s$/, '');
    const name = i > 0 && /^\p{Lu}/u.test(w) && w !== w.toUpperCase();
    keys.set(k, (keys.get(k) ?? false) || name);
  });
  return keys;
}

export interface Cluster { outlets: string[]; groups: string[]; langs: string[]; items: FeedItem[] }

/**
 * Groups headlines from different outlets that share enough words to look like one story:
 * three shared words, or two when one is a name. A hint for the edition, not a verdict.
 */
export function clusterItems(items: FeedItem[], groupOf: Record<string, string>, cap = 30): Cluster[] {
  const keys = items.map((x) => keywords(x.t));
  const parent = items.map((_, i) => i), size = items.map(() => 1);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].o === items[j].o) continue;
      let shared = 0, names = 0;
      for (const [k, n] of keys[i]) if (keys[j].has(k)) { shared++; if (n || keys[j].get(k)) names++; }
      // across languages only names carry over
      const ok = items[i].lang === items[j].lang ? shared >= 3 || (shared >= 2 && names >= 1) : names >= 2;
      if (!ok) continue;
      const a = find(i), b = find(j);
      if (a === b || size[a] + size[b] > cap) continue;
      parent[b] = a;
      size[a] += size[b];
    }
  const byRoot = new Map<number, FeedItem[]>();
  items.forEach((x, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), x]));
  return [...byRoot.values()]
    .map((its) => ({
      outlets: [...new Set(its.map((x) => x.o))],
      groups: [...new Set(its.map((x) => groupOf[x.o]))],
      langs: [...new Set(its.map((x) => x.lang))],
      items: its,
    }))
    .filter((c) => c.outlets.length >= 2)
    .sort((a, b) => b.outlets.length - a.outlets.length || b.groups.length - a.groups.length);
}
