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

describe('"Also reported by" links and the outlet traffic report', () => {
  // A real link from another story in the same edition, standing in as another outlet's coverage.
  const s = edition.stories[0];
  const other = edition.stories.flatMap((t) => t.src).find(([k]) => !s.src.some(([k2]) => k2 === k))!;
  const withAlso = structuredClone(edition);
  withAlso.stories[0].also = [[other[0], other[1]]];

  it('stores the links without changing the grade or the source count', async () => {
    await as('service_role', null, () => load(withAlso));
    const { rows } = await db.query<{ id: number; also: [string, string][]; sources: number; score: number; grade: string }>(
      'select id, also, sources, score, grade from public.stories where slug = $1', [s.id]);
    const g = gradeStory(s);
    expect(rows[0].also).toEqual([[other[0], other[1]]]);
    expect([rows[0].sources, rows[0].score, rows[0].grade]).toEqual([g.sources, g.score, g.grade]);
  });

  it('counts how often each outlet was offered and clicked, for admins only', async () => {
    const { rows } = await db.query<{ id: number }>('select id from public.stories where slug = $1', [s.id]);
    const sid = rows[0].id;
    await db.query(`insert into public.events (anon_id, name, story_id, props) values
      ('reader-one-aaaa', 'story_open', $1, '{}'), ('reader-two-bbbb', 'story_open', $1, '{}'),
      ('reader-one-aaaa', 'source_click', $1, $2::jsonb), ('reader-one-aaaa', 'source_click', $1, $3::jsonb)`,
      [sid, JSON.stringify({ outlet: other[0], kind: 'also' }), JSON.stringify({ outlet: s.src[0][0], kind: 'receipt' })]);
    await expect(as('authenticated', READER, () => db.query('select * from dr_admin_outlets(30)'))).rejects.toThrow(/not allowed/);
    const r = await as('authenticated', ADMIN, () => db.query<{ outlet: string; offered: number; clicks: number; also_clicks: number; readers: number }>('select * from dr_admin_outlets(30)'));
    const also = r.rows.find((x) => x.outlet === other[0])!;
    expect(Number(also.offered)).toBeGreaterThanOrEqual(2);
    expect([Number(also.clicks), Number(also.also_clicks), Number(also.readers)]).toEqual([1, 1, 1]);
    const rec = r.rows.find((x) => x.outlet === s.src[0][0])!;
    expect([Number(rec.clicks), Number(rec.also_clicks)]).toEqual([1, 0]);
  });
});

describe('daily question answers', () => {
  it('a reader adds and reads only their own, once per day', async () => {
    await as('authenticated', READER, () => db.query(`insert into public.daily_answers (day, result) values ('2026-10-17', 'correct')`));
    await expect(as('authenticated', READER, () => db.query(`insert into public.daily_answers (day, result) values ('2026-10-17', 'wrong')`))).rejects.toThrow(/duplicate|unique/);
    await expect(as('authenticated', READER, () => db.query(`update public.daily_answers set result = 'correct'`))).rejects.toThrow(/permission denied/);
    await expect(as('authenticated', READER, () => db.query(`insert into public.daily_answers (user_id, day, result) values ('${ADMIN}', '2026-10-17', 'correct')`))).rejects.toThrow(/row-level security/);
    const mine = await as('authenticated', READER, () => db.query<{ day: string }>('select day::text from public.daily_answers'));
    expect(mine.rows).toEqual([{ day: '2026-10-17' }]);
    const theirs = await as('authenticated', ADMIN, () => db.query('select * from public.daily_answers'));
    expect(theirs.rows).toEqual([]);
    await expect(as('anon', null, () => db.query('select * from public.daily_answers'))).rejects.toThrow(/permission denied/);
  });

  it('admins see the daily summary', async () => {
    const r = await as('authenticated', ADMIN, () => db.query<{ answered: number; correct: number }>('select * from dr_admin_daily(3650)'));
    expect(r.rows.map((x) => [Number(x.answered), Number(x.correct)])).toEqual([[1, 1]]);
  });
});

describe('securing a username', () => {
  const OTHER = '33333333-3333-4333-8333-333333333333';
  const claim = (uid: string | null, name: string) =>
    as(uid ? 'authenticated' : 'anon', uid, () => db.query<{ r: { ok: boolean; reason?: string; name?: string; awarded?: number } }>('select public.dr_claim_username($1) r', [name])).then((x) => x.rows[0].r);
  const available = (uid: string | null, name: string) =>
    as(uid ? 'authenticated' : 'anon', uid, () => db.query<{ r: string }>('select public.dr_username_available($1) r', [name])).then((x) => x.rows[0].r);

  beforeAll(async () => {
    await db.exec(`insert into auth.users (id, email) values ('${OTHER}', 'other@example.com') on conflict do nothing`);
  });

  it('needs an account', async () => {
    await expect(claim(null, 'jay')).rejects.toThrow(/permission denied/);
  });

  it('signing up earns 10 gold tokens, once', async () => {
    const mine = await as('authenticated', OTHER, () => db.query<{ reason: string; amount: number }>('select reason, amount from public.token_awards'));
    expect(mine.rows).toEqual([{ reason: 'signup', amount: 10 }]);
  });

  it('the first claim earns 5 gold tokens, once; changing it later earns none', async () => {
    expect(await claim(READER, '  jay ')).toEqual({ ok: true, name: 'jay', awarded: 5 });
    expect(await claim(READER, 'Jay T')).toEqual({ ok: true, name: 'Jay T', awarded: 0 });
    expect(await claim(READER, 'jay')).toEqual({ ok: true, name: 'jay', awarded: 0 });
    const awards = await as('authenticated', READER, () => db.query<{ reason: string; amount: number }>('select reason, amount from public.token_awards order by reason'));
    expect(awards.rows).toEqual([{ reason: 'signup', amount: 10 }, { reason: 'username', amount: 5 }]);
  });

  it('a username is one reader\'s only, whatever the capitals', async () => {
    expect(await available(OTHER, 'JAY')).toBe('taken');
    expect(await claim(OTHER, 'JAY')).toEqual({ ok: false, reason: 'taken' });
    expect(await available(READER, 'jay')).toBe('ok'); // it's already theirs
    // and nobody sees anyone else's tokens
    const theirs = await as('authenticated', OTHER, () => db.query<{ reason: string }>('select reason from public.token_awards'));
    expect(theirs.rows).toEqual([{ reason: 'signup' }]);
  });

  it('keeps out reserved, rude and badly formed names', async () => {
    expect(await available(null, 'Emma')).toBe('reserved');
    expect(await available(null, 'x')).toBe('too short');
    expect(await available(null, 'a<b>')).toMatch(/only/);
    expect(await available(null, 'BullShitter')).toBe('not allowed');
  });
});

describe('the membership questionnaire', () => {
  const NEW = '66666666-6666-4666-8666-666666666666';
  const send = (uid: string | null, anon: string, price: string, extras: string[] | null) =>
    as(uid ? 'authenticated' : 'anon', uid, () =>
      db.query<{ r: { awarded: number } }>(
        `select dr_send_questionnaire($1, (select id from editions limit 1), 4::smallint, 2::smallint, $2, $3::text[], ' daily alerts ') r`,
        [anon, price, extras],
      )).then((x) => x.rows[0].r);
  const awards = (uid: string) =>
    as('authenticated', uid, () => db.query<{ reason: string; amount: number }>("select reason, amount from token_awards where reason = 'questionnaire'")).then((x) => x.rows);

  beforeAll(async () => {
    await db.exec(`insert into auth.users (id, email) values ('${NEW}', 'new@example.com') on conflict do nothing`);
  });

  it('saves price and extras, and the old yes/maybe/no from the price', async () => {
    await send(null, 'device-q12345', 'monthly', ['roundup', 'alerts']);
    const { rows } = await db.query<{ price: string; pay: string; extras: string[] }>("select price, pay, extras from feedback where anon_id = 'device-q12345'");
    expect(rows).toEqual([{ price: 'monthly', pay: 'yes', extras: ['roundup', 'alerts'] }]);
    await expect(send(null, 'device-q12345', 'monthly', ['bitcoin'])).rejects.toThrow();
    await expect(send(null, 'device-q12345', 'free please', null)).rejects.toThrow();
  });

  it('a signed-in reader wins 10 gold tokens the first time, and only once', async () => {
    expect(await send(NEW, 'device-q99999', 'annual', ['support'])).toEqual({ awarded: 10 });
    expect(await send(NEW, 'device-q99999', 'cheaper', null)).toEqual({ awarded: 0 });
    expect(await awards(NEW)).toEqual([{ reason: 'questionnaire', amount: 10 }]);
  });

  it('someone who answered before signing up gets theirs after signing in', async () => {
    await as('authenticated', ADMIN, () => db.query(`select dr_claim_device('device-q12345')`));
    const got = await as('authenticated', ADMIN, () => db.query<{ n: number }>('select dr_claim_questionnaire_award() n'));
    expect(got.rows[0].n).toBe(10);
    const again = await as('authenticated', ADMIN, () => db.query<{ n: number }>('select dr_claim_questionnaire_award() n'));
    expect(again.rows[0].n).toBe(0);
  });

  it('admins see what readers would pay and want; nobody else does', async () => {
    const m = await as('authenticated', ADMIN, () => db.query<{ m: { answers: number; price: Record<string, number>; extras: Record<string, number> } }>('select dr_admin_membership() m'));
    expect(m.rows[0].m.price).toMatchObject({ monthly: 1, cheaper: 1 });
    expect(m.rows[0].m.extras.roundup).toBe(1);
    await expect(as('authenticated', NEW, () => db.query('select dr_admin_membership()'))).rejects.toThrow(/admins only/);
  });
});

describe('the profile holds email, username and gold tokens', () => {
  const PERSON = '77777777-7777-4777-8777-777777777777';
  const profile = () => db.query<{ email: string; username: string | null; gold_tokens: number }>(`select email, username, gold_tokens from profiles where user_id = '${PERSON}'`).then((r) => r.rows[0]);

  it('signing up saves the email and 10 tokens', async () => {
    await db.exec(`insert into auth.users (id, email) values ('${PERSON}', 'person@example.com')`);
    expect(await profile()).toEqual({ email: 'person@example.com', username: null, gold_tokens: 10 });
  });

  it('a secured username and correct answers add up on the profile', async () => {
    await as('authenticated', PERSON, () => db.query(`select dr_claim_username('Person')`));
    await as('authenticated', PERSON, () => db.query(`insert into daily_answers (day, result) values ('2026-10-20', 'correct'), ('2026-10-21', 'wrong')`));
    expect(await profile()).toEqual({ email: 'person@example.com', username: 'Person', gold_tokens: 16 });
  });

  it('readers can change their choices but not their tokens, email or username', async () => {
    await as('authenticated', PERSON, () => db.query(`update profiles set min_grade = 'B' where user_id = '${PERSON}'`));
    // the app saves with an upsert, exactly like this
    await as('authenticated', PERSON, () => db.query(
      `insert into profiles (user_id, topic_order, min_grade, mode, deck_size, voice, display_name, updated_at)
       values ('${PERSON}', '{world}', 'C', 'swipe', 'standard', 'both', 'Person', now())
       on conflict (user_id) do update set user_id = excluded.user_id, topic_order = excluded.topic_order, min_grade = excluded.min_grade,
         mode = excluded.mode, deck_size = excluded.deck_size, voice = excluded.voice, display_name = excluded.display_name, updated_at = excluded.updated_at`));
    await expect(as('authenticated', PERSON, () => db.query(`update profiles set user_id = '${READER}' where user_id = '${PERSON}'`))).rejects.toThrow();
    await expect(as('authenticated', PERSON, () => db.query(`update profiles set gold_tokens = 9999 where user_id = '${PERSON}'`))).rejects.toThrow(/permission denied/);
    await expect(as('authenticated', PERSON, () => db.query(`update profiles set username = 'Emma' where user_id = '${PERSON}'`))).rejects.toThrow(/permission denied/);
    await expect(as('authenticated', PERSON, () => db.query(`update profiles set email = 'x@example.com' where user_id = '${PERSON}'`))).rejects.toThrow(/permission denied/);
    expect((await profile()).gold_tokens).toBe(16);
  });

  it('a changed email follows on the profile', async () => {
    await db.exec(`update auth.users set email = 'new-person@example.com' where id = '${PERSON}'`);
    expect((await profile()).email).toBe('new-person@example.com');
  });
});
