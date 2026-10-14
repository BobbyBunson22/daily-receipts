-- Checks the schema, seed, grading and row-level security.
-- Run by scripts/test-db.sh after the migration, seed and expected-grade tables are loaded.
\set ON_ERROR_STOP 1

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

-- Every public table has RLS on.
select pg_temp.check(
  not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
  'row-level security is enabled on every public table');

-- Seed loaded.
select pg_temp.check((select count(*) from public.editions where issue = 3 and status = 'published') = 1, 'issue 3 is published');
select pg_temp.check((select count(*) from public.stories) = (select count(*) from test.expected_story), 'all stories seeded');
select pg_temp.check((select count(*) from public.story_sources) = (select sum(sources) from test.expected_story), 'all sources seeded');
select pg_temp.check((select count(*) from public.sections) = 10, '10 sections seeded');

-- Grades computed in the database match the prototype's published grades.
select pg_temp.check(
  not exists (
    select 1 from test.expected_story e left join public.stories s on s.slug = e.slug
    where s.id is null or s.score <> e.score or s.grade <> e.grade
       or s.sources <> e.sources or s.importance <> e.importance
  ),
  'database grades match the edition''s computed grades');

-- The SQL formula matches src/lib/grading.ts across a grid of meter values.
select pg_temp.check(
  not exists (
    select 1 from test.expected_grid g
    where public.dr_story_score(g.c, g.p, g.st, g.n) <> g.score
       or public.dr_grade_for(g.score) <> g.grade
  ),
  'SQL grading matches TypeScript grading on ' || (select count(*) from test.expected_grid) || ' meter combinations');

-- Grades follow the sources: removing and re-adding a source regrades the story.
begin;
  create temp table before_change as
    select s.id, s.score, s.sources from public.stories s where s.slug = 'w-bnd-hanning-arrest';
  delete from public.story_sources where story_id = (select id from before_change) and sort = 2;
  select pg_temp.check(
    (select sources from public.stories where id = (select id from before_change)) = 2
    and (select score from public.stories where id = (select id from before_change))
        = public.dr_story_score(85, 75, 60, 2),
    'deleting a source regrades the story');
  update public.stories set score = 100, grade = 'A' where id = (select id from before_change);
  select pg_temp.check(
    (select grade from public.stories where id = (select id from before_change)) <> 'A',
    'grade cannot be hand-set');
rollback;

-- ---- RLS as an anonymous reader
insert into public.editions (issue, date, date_label, compiled_at, status)
  values (999, '2099-01-01', 'Draft test', now(), 'draft');
insert into public.stories (edition_id, slug, sort, sec, sub, head, stand, body, kept, m_corroboration, m_primary, m_stability)
  select id, 'draft-story', 0, 'world', 'Europe', 'Draft headline', 'Draft', '{x}', '[["a","b"]]', 50, 50, 50
  from public.editions where issue = 999;
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into public.reactions (user_id, story_id, value)
  select '00000000-0000-0000-0000-00000000000b', id, 1 from public.stories where slug = 'w-bnd-hanning-arrest';

set role anon;
select pg_temp.check((select count(*) from public.editions) = 1, 'anon sees only published editions');
select pg_temp.check(not exists (select 1 from public.stories where slug = 'draft-story'), 'anon cannot see draft stories');
select pg_temp.check((select count(*) from public.stories) = (select count(*) from test.expected_story), 'anon sees published stories');
select pg_temp.check((select count(*) from public.story_sources) > 0, 'anon sees sources');
select pg_temp.check((select count(*) from public.reactions) = 0, 'anon sees no reader data');
do $$ begin
  insert into public.editions (issue, date, date_label, compiled_at, status) values (1000, '2099-01-02', 'x', now(), 'published');
  raise exception 'FAILED: anon inserted an edition';
exception when insufficient_privilege then raise notice 'ok - anon cannot write editions';
end $$;
do $$ begin
  update public.stories set head = 'tampered';
  if exists (select 1 from public.stories where head = 'tampered') then raise exception 'FAILED: anon edited a story'; end if;
  raise notice 'ok - anon cannot edit stories';
end $$;
reset role;

-- ---- RLS as signed-in reader A
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.check((select count(*) from public.reactions) = 0, 'reader A cannot see reader B''s reactions');
insert into public.reactions (user_id, story_id, value)
  select '00000000-0000-0000-0000-00000000000a', id, -1 from public.stories where slug = 'w-bnd-hanning-arrest';
select pg_temp.check((select count(*) from public.reactions) = 1, 'reader A can write and read own reaction');
do $$ begin
  insert into public.reactions (user_id, story_id, value)
    select '00000000-0000-0000-0000-00000000000b', id, -1 from public.stories where slug = 'w-yemen-offensive-aden';
  raise exception 'FAILED: reader A wrote a row as reader B';
exception when insufficient_privilege then raise notice 'ok - reader A cannot write as reader B';
end $$;
do $$ begin
  delete from public.stories;
  if (select count(*) from public.stories) = 0 then raise exception 'FAILED: reader deleted stories'; end if;
  raise notice 'ok - reader cannot delete stories';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
