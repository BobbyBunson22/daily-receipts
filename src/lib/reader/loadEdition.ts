/**
 * Loads the latest published edition for the page (server only).
 *
 * With Supabase configured, it reads the database, including the grades the
 * database computed. Without it (local preview only), it reads the newest
 * data/edition-*.json and grades it with the same formula. In production a
 * failure shows an error rather than an old edition passed off as today's.
 */
import 'server-only';

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Edition, GradeLetter, Meters } from '../../types/edition';
import { gradeStory } from '../grading';
import { prepareEdition } from '../prepareEdition';
import { SUPABASE_URL, hasSupabase } from '../supabase/env';
import { supabasePublic } from '../supabase/server';
import type { ClientEdition, ClientStory } from './types';

interface StoryRow {
  id: number;
  slug: string;
  sort: number;
  sec: string;
  sub: string;
  head: string;
  stand: string;
  say: string | null;
  body: string[];
  kept: [string, string][];
  cut: [string, string][];
  open: string[];
  primary_sources: string[];
  m_corroboration: number;
  m_primary: number;
  m_stability: number;
  fig: [string, string] | null;
  also: [string, string][] | null;
  sources: number;
  score: number;
  grade: GradeLetter;
  importance: number | string;
  story_sources: { sort: number; outlet_key: string; url: string; note: string | null; outlets: { name: string; country: string } | null }[];
  voice_clips: { path: string; created_at: string }[];
}

const clipUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/voice/${path.split('/').map(encodeURIComponent).join('/')}`;

async function fromDatabase(): Promise<ClientEdition | null> {
  const db = supabasePublic();
  const { data: ed, error } = await db
    .from('editions')
    .select('id, issue, date_label, compiled_at')
    .eq('status', 'published')
    .order('issue', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read editions: ${error.message}`);
  if (!ed) return null;

  const [{ data: sections, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
    db.from('sections').select('id, name, subs').order('sort'),
    db
      .from('stories')
      .select(
        'id, slug, sort, sec, sub, head, stand, say, body, kept, cut, open, primary_sources, m_corroboration, m_primary, m_stability, fig, sources, score, grade, importance, story_sources(sort, outlet_key, url, note, outlets(name, country)), voice_clips(path, created_at)',
      )
      .eq('edition_id', ed.id)
      .order('sort'),
  ]);
  if (e1 || e2) throw new Error(`Couldn't read the edition: ${(e1 ?? e2)!.message}`);

  // "Also reported by" links, read separately so the page still loads if the column isn't there yet
  const alsoById = new Map<number, [string, string][]>();
  const { data: alsoRows, error: eAlso } = await db.from('stories').select('id, also').eq('edition_id', ed.id);
  if (eAlso) console.warn(`"Also reported by" links skipped: ${eAlso.message}`);
  for (const r of (alsoRows ?? []) as { id: number; also: [string, string][] | null }[]) if (r.also?.length) alsoById.set(r.id, r.also);
  for (const r of rows as unknown as StoryRow[]) r.also = alsoById.get(r.id) ?? [];
  const alsoKeys = [...new Set([...alsoById.values()].flatMap((a) => a.map((x) => x[0])))];
  const names = new Map<string, string>();
  if (alsoKeys.length) {
    const { data: outs, error: e3 } = await db.from('outlets').select('key, name').in('key', alsoKeys);
    if (e3) throw new Error(`Couldn't read outlets: ${e3.message}`);
    for (const o of outs ?? []) names.set(o.key, o.name);
  }

  const stories: ClientStory[] = (rows as unknown as StoryRow[]).map((r) => {
    const clips = r.voice_clips.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      id: r.id,
      slug: r.slug,
      sec: r.sec,
      sub: r.sub,
      head: r.head,
      stand: r.stand,
      body: r.body,
      kept: r.kept,
      cut: r.cut,
      open: r.open,
      primary: r.primary_sources,
      m: [r.m_corroboration, r.m_primary, r.m_stability] as Meters,
      src: r.story_sources
        .slice()
        .sort((a, b) => a.sort - b.sort)
        .map((s) => ({ key: s.outlet_key, name: s.outlets?.name ?? s.outlet_key, country: s.outlets?.country ?? '', url: s.url, note: s.note })),
      fig: r.fig,
      also: (r.also ?? []).filter((a) => names.has(a[0])).map(([key, url]) => ({ key, url, name: names.get(key)! })),
      say: r.say,
      sources: r.sources,
      score: r.score,
      grade: r.grade,
      importance: Number(r.importance),
      clip: clips[0] ? clipUrl(clips[0].path) : null,
    };
  });

  return {
    id: ed.id,
    issue: ed.issue,
    date: ed.date_label,
    compiled: ed.compiled_at,
    sections: sections ?? [],
    stories,
    outletCount: new Set(stories.flatMap((s) => s.src.map((x) => x.key))).size,
    voice: null,
  };
}

/** Local preview: the newest edition file in data/, graded with the shared formula. */
export function fromFile(file?: string): ClientEdition {
  const dir = join(process.cwd(), 'data');
  const name = file ?? readdirSync(dir).filter((f) => /^edition-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().pop();
  if (!name) throw new Error('No edition in data/');
  const { edition } = prepareEdition(JSON.parse(readFileSync(join(dir, name), 'utf8')) as Edition);
  const stories: ClientStory[] = edition.stories.map((s, i) => {
    const g = gradeStory(s);
    return {
      id: i + 1,
      slug: s.id,
      sec: s.sec,
      sub: s.sub,
      head: s.head,
      stand: s.stand,
      body: s.body,
      kept: s.kept,
      cut: s.cut,
      open: s.open,
      primary: s.primary,
      m: s.m,
      src: s.src.map(([key, url, note]) => ({ key, url, note: note ?? null, name: edition.outlets[key]?.name ?? key, country: edition.outlets[key]?.country ?? '' })),
      fig: s.fig ?? null,
      also: (s.also ?? []).map(([key, url]) => ({ key, url, name: edition.outlets[key]?.name ?? key })),
      say: s.say ?? null,
      sources: g.sources,
      score: g.score,
      grade: g.grade,
      importance: g.importance,
      clip: null,
    };
  });
  return {
    id: null,
    issue: edition.edition.issue,
    date: edition.edition.date,
    compiled: edition.edition.compiled,
    sections: edition.sections,
    stories,
    outletCount: new Set(stories.flatMap((s) => s.src.map((x) => x.key))).size,
    voice: null,
  };
}

export async function loadEdition(): Promise<ClientEdition | null> {
  if (!hasSupabase()) return fromFile();
  return fromDatabase();
}
