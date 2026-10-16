/**
 * Reads every outlet's feeds in data/feeds.json and writes today's shortlist:
 * headlines and links from the last 36 hours, grouped into stories covered by 2+ outlets.
 * Used by the "Fetch feeds" GitHub Action, which publishes the result on the `feeds` branch
 * for the morning edition to read.
 *
 *   npx tsx scripts/fetch-feeds.ts out/feeds.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { clusterItems, parseFeed, type FeedItem, type FeedOutlet } from '../src/lib/feeds';

const WINDOW_H = 36;
const PER_OUTLET = 60;
const UA = 'DailyReceiptsFeeds/1.0 (+https://www.dailyreceipts.com)';

async function get(url: string) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const out = process.argv[2] ?? 'out/feeds.json';
  const { outlets } = JSON.parse(readFileSync('data/feeds.json', 'utf8')) as { outlets: FeedOutlet[] };
  const now = Date.now(), since = now - WINDOW_H * 3600e3;
  const report: { key: string; name: string; group: string; ok: boolean; items: number; errors: string[] }[] = [];
  const items: FeedItem[] = [];

  await Promise.all(outlets.map(async (o) => {
    const seen = new Set<string>(), errors: string[] = [];
    let mine: FeedItem[] = [];
    for (const f of o.feeds) {
      try {
        for (const x of parseFeed(await get(f))) {
          const u = x.u.split('#')[0];
          if (seen.has(u)) continue;
          seen.add(u);
          if (x.at && (Date.parse(x.at) < since || Date.parse(x.at) > now + 3600e3)) continue;
          mine.push({ o: o.key, t: x.t, u, at: x.at, lang: o.lang });
        }
      } catch (e) {
        errors.push(`${f}: ${(e as Error).message}`);
      }
    }
    mine = mine.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, PER_OUTLET);
    items.push(...mine);
    report.push({ key: o.key, name: o.name, group: o.group, ok: mine.length > 0, items: mine.length, errors });
  }));

  const groupOf = Object.fromEntries(outlets.map((o) => [o.key, o.group]));
  const clusters = clusterItems(items, groupOf);
  report.sort((a, b) => outlets.findIndex((o) => o.key === a.key) - outlets.findIndex((o) => o.key === b.key));
  const result = {
    generated: new Date(now).toISOString(),
    window_hours: WINDOW_H,
    note: 'Headlines and links only. A story here is a lead, not a source: take facts only from article pages actually opened. Spanish (lang "es") items are written up in English.',
    outlets: Object.fromEntries(outlets.map((o) => [o.key, { name: o.name, country: o.country, group: o.group, lang: o.lang, lean: o.lean }])),
    health: report,
    stories: clusters.slice(0, 120),
    items: items.sort((a, b) => a.o.localeCompare(b.o) || (b.at ?? '').localeCompare(a.at ?? '')),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 1));
  const okN = report.filter((r) => r.ok).length;
  console.log(`${okN} of ${outlets.length} outlets read, ${items.length} headlines, ${clusters.length} stories covered by 2+ outlets`);
  for (const r of report) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.key.padEnd(13)} ${String(r.items).padStart(3)}  ${r.errors.join(' | ')}`);
  console.log('\nTop stories by outlet count:');
  for (const c of clusters.slice(0, 15)) console.log(`  ${c.outlets.length} outlets, ${c.groups.length} groups: ${c.items[0].t}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
