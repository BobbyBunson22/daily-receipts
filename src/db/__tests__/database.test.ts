/**
 * Runs the real migrations on an in-memory Postgres (PGlite) and checks the
 * things the web beta depends on: loading an edition, grades computed in the
 * database, re-runs keeping readers' data, row-level security, feedback and
 * the admin reports.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { gradeStory } from '../../lib/grading';
import { prepareEdition } from '../../lib/prepareEdition';
import { validateEdition } from '../../lib/validateEdition';
import type { Edition } from '../../types/edition';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const raw = JSON.parse(read('data/edition-2026-10-12.json')) as Edition;
const { edition, notes } = prepareEdition(raw);

const READER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';

let db: PGlite;

/** Run as a Supabase API role, optionally signed in. */
async function as<T>(role: 'anon' | 'authenticated' | 'service_role', uid: string | null, fn: () => Promise<T>) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const load = (e: unknown) => db.query<{ id: number }>('select public.dr_load_edition($1::jsonb) as id', [JSON.stringify(e)]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(read('supabase/tests/00_supabase_stubs.sql'));
  for (const f of readdirSync(join(root, 'supabase/migrations')).sort()) await db.exec(read(`supabase/migrations/${f}`));
  await db.exec(`insert into auth.users (id, email) values ('${READER}', 'reader@example.com'), ('${ADMIN}', 'admin@example.com');
                 insert into public.admins (user_id) values ('${ADMIN}');`);
}, 60_000);

afterAll(async () => db?.close());

describe('loading an edition', () => {
  it('the live edition only needs its http links upgraded to pass validation', () => {
    expect(validateEdition(raw).ok).toBe(false);
    expect(notes).toEqual(['c-jerusalem-aqueduct: upgraded http://www.jpost.com/archaeology/article-911290 to https']);
    expect(validateEdition(edition)).toEqual({ ok: true, errors: [] });
  });

  it('only the server role may load', async () => {
    await expect(as('anon', null, () => load(edition))).rejects.toThrow(/permission denied/);
    await expect(as('authenticated', READER, () => load(edition))).rejects.toThrow(/permission denied/);
  });

  it('loads every story and source, published', async () => {
    await as('service_role', null, () => load(edition));
    const { rows } = await db.query<{ n: number; src: number; status: string; date: string }>(
      `select count(*)::int n, (select count(*)::int from story_sources) src, e.status, e.date::text
       from stories s join editions e on e.id = s.edition_id group by e.id`);
    expect(rows).toEqual([{
      n: edition.stories.length,
      src: edition.stories.reduce((a, s) => a + s.src.length, 0),
      status: 'published',
      date: '2026-10-12',
    }]);
  });

  it('computes the same grades as the TypeScript formula', async () => {
    const { rows } = await db.query<{ slug: string; score: number; grade: string; sources: number; importance: string }>(
      'select slug, score, grade, sources, importance::text from stories');
    for (const r of rows) {
      const g = gradeStory(edition.stories.find((s) => s.id === r.slug)!);
      expect({ slug: r.slug, score: r.score, grade: r.grade, sources: r.sources, importance: Number(r.importance) })
        .toEqual({ slug: r.slug, score: g.score, grade: g.grade, sources: g.sources, importance: Math.round(g.importance * 10) / 10 });
    }
  });

  it('a re-run updates in place and keeps readers\' likes', async () => {
    const story = edition.stories[0];
    const { rows: [s] } = await db.query<{ id: number }>('select id from stories where slug = $1', [story.id]);
    await as('authenticated', READER, () =>
      db.query('insert into reactions (user_id, story_id, value) values ($1, $2, 1)', [READER, s.id]));

    const changed = structuredClone(edition);
    changed.stories[0].m = [20, 20, 20];
    changed.stories[0].src = changed.stories[0].src.slice(0, 1);
    changed.stories.pop();
    await as('service_role', null, () => load(changed));

    const { rows: [after] } = await db.query<{ id: number; grade: string; n: number; likes: number }>(
      `select id, grade, (select count(*)::int from stories) n, (select count(*)::int from reactions) likes from stories where slug = $1`, [story.id]);
    expect(after.id).toBe(s.id);
    expect(after.grade).toBe(gradeStory({ m: [20, 20, 20], src: [0] }).grade);
    expect(after.n).toBe(edition.stories.length - 1);
    expect(after.likes).toBe(1);

    await as('service_role', null, () => load(edition));
  });

  it('rejects a bad date', async () => {
    const bad = structuredClone(edition);
    bad.edition.date = 'someday';
    await expect(as('service_role', null, () => load(bad))).rejects.toThrow(/bad edition date/);
  });
});

describe('row-level security', () => {
  it('every public table has RLS on', async () => {
    const { rows } = await db.query(`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`);
    expect(rows).toEqual([]);
  });

  it('anyone can add events but nobody can read them', async () => {
    await as('anon', null, () =>
      db.query(`insert into events (anon_id, name, props) values ('device-abc123', 'open', '{"mode":"swipe"}')`));
    await as('authenticated', READER, () =>
      db.query(`insert into events (anon_id, name) values ('device-abc123', 'signin')`));
    const seen = await as('anon', null, () => db.query('select * from events'));
    expect(seen.rows).toEqual([]);
    const { rows } = await db.query<{ user_id: string | null }>('select user_id from events order by id');
    expect(rows.map((r) => r.user_id)).toEqual([null, READER]);
  });

  it('a reader cannot write events as someone else or with unknown names', async () => {
    await expect(as('authenticated', READER, () =>
      db.query(`insert into events (anon_id, name, user_id) values ('device-abc123', 'open', '${ADMIN}')`))).rejects.toThrow();
    await expect(as('anon', null, () =>
      db.query(`insert into events (anon_id, name) values ('device-abc123', 'drop tables')`))).rejects.toThrow();
  });

  it('readers only see their own reactions', async () => {
    const mine = await as('authenticated', READER, () => db.query('select * from reactions'));
    const theirs = await as('authenticated', ADMIN, () => db.query('select * from reactions'));
    expect(mine.rows.length).toBe(1);
    expect(theirs.rows.length).toBe(0);
  });

  it('anonymous readers can see the published edition', async () => {
    const { rows } = await as('anon', null, () => db.query<{ n: number }>('select count(*)::int n from stories'));
    expect(rows[0].n).toBe(edition.stories.length);
  });
});

describe('feedback', () => {
  const send = (anon: string, useful: number, pay: string) =>
    db.query(`select dr_send_feedback($1, (select id from editions limit 1), $2::smallint, 2::smallint, 'swipe', $3, ' more sport ')`, [anon, useful, pay]);

  it('anyone can send it, and sending again updates the same answer', async () => {
    await as('anon', null, () => send('device-xyz789', 3, 'maybe'));
    await as('anon', null, () => send('device-xyz789', 5, 'yes'));
    const { rows } = await db.query<{ useful: number; pay: string; wish: string }>('select useful, pay, wish from feedback');
    expect(rows).toEqual([{ useful: 5, pay: 'yes', wish: 'more sport' }]);
  });

  it('signing in claims what the reader did on that browser', async () => {
    await as('authenticated', READER, () => db.query(`select dr_claim_device('device-xyz789')`));
    const { rows } = await db.query<{ user_id: string }>('select user_id from feedback');
    expect(rows[0].user_id).toBe(READER);
  });
});

describe('admin reports', () => {
  it('refuse anyone who is not an admin', async () => {
    await expect(as('authenticated', READER, () => db.query('select dr_admin_overview()'))).rejects.toThrow(/not allowed/);
    await expect(as('anon', null, () => db.query('select dr_admin_overview()'))).rejects.toThrow(/permission denied/);
  });

  it('give an admin the overview, feedback, people and stories', async () => {
    const o = await as('authenticated', ADMIN, () => db.query<{ o: Record<string, Record<string, unknown>> }>('select dr_admin_overview() o'));
    expect(o.rows[0].o.people.accounts).toBe(2);
    expect(o.rows[0].o.people.visitors_today).toBe(1);
    expect(o.rows[0].o.feedback.answers).toBe(1);
    const fb = await as('authenticated', ADMIN, () => db.query<{ who: string; wish: string }>('select who, wish from dr_admin_feedback()'));
    expect(fb.rows).toEqual([{ who: 'reader@example.com', wish: 'more sport' }]);
    const people = await as('authenticated', ADMIN, () => db.query('select * from dr_admin_people()'));
    expect(people.rows.length).toBe(2);
    const stories = await as('authenticated', ADMIN, () => db.query('select * from dr_admin_stories()'));
    expect(stories.rows.length).toBe(edition.stories.length);
  });
});

describe('profiles', () => {
  it('are created at sign-up', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    await db.query('insert into auth.users (id) values ($1)', [id]);
    const { rows } = await db.query('select user_id from profiles where user_id = $1', [id]);
    expect(rows.length).toBe(1);
  });

  it('an invited email becomes an admin when it signs up, and nobody else does', async () => {
    await db.query(`insert into admin_invites (email) values ('boss@example.com')`);
    await db.query(`insert into auth.users (id, email) values ('44444444-4444-4444-8444-444444444444', 'Boss@Example.com'),
                                                         ('55555555-5555-4555-8555-555555555555', 'someone@example.com')`);
    const { rows } = await db.query<{ email: string }>(
      `select u.email from admins a join auth.users u on u.id = a.user_id order by 1`);
    expect(rows.map((r) => r.email)).toEqual(['Boss@Example.com', 'admin@example.com']);
    const peek = await as('authenticated', READER, () => db.query('select * from admin_invites'));
    expect(peek.rows).toEqual([]);
  });
});
