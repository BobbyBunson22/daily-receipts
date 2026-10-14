-- Daily Receipts: initial schema (docs/ARCHITECTURE.md, Data model).
--
-- Access model
--   * Readers (anon and signed-in) can read published editions and their stories,
--     sources, sections, outlets, voice clips and the corrections log.
--   * Signed-in readers can read and write only their own rows.
--   * Only server jobs (service role, which bypasses RLS) write editions,
--     stories, sources, clips and corrections. No client policy allows it.
--   * score, grade and importance are computed here by trigger from the meters
--     and the number of sources. Nobody sets them by hand.

-- ---------------------------------------------------------------- editions

create table public.editions (
  id          bigint generated always as identity primary key,
  issue       integer not null unique check (issue > 0),
  date        date not null unique,
  date_label  text not null,                 -- "Wednesday, 7 October 2026"
  compiled_at timestamptz not null,
  status      text not null default 'draft' check (status in ('draft', 'published')),
  created_at  timestamptz not null default now()
);

create table public.sections (
  id   text primary key,                     -- 'world', 'uk', …
  name text not null,
  subs text[] not null default '{}',
  sort smallint not null
);

create table public.outlets (
  key     text primary key,
  name    text not null,
  country text not null
);

create table public.stories (
  id              bigint generated always as identity primary key,
  edition_id      bigint not null references public.editions (id) on delete cascade,
  slug            text not null,
  sort            smallint not null,         -- order within the edition, as written
  sec             text not null references public.sections (id),
  sub             text not null,
  head            text not null,
  say             text,
  stand           text not null,
  body            text[] not null,
  kept            jsonb not null,            -- [[fact, support], …]
  cut             jsonb not null default '[]'::jsonb,   -- [[claim, reason], …]
  open            text[] not null default '{}',
  primary_sources text[] not null default '{}',
  m_corroboration smallint not null check (m_corroboration between 0 and 100),
  m_primary       smallint not null check (m_primary between 0 and 100),
  m_stability     smallint not null check (m_stability between 0 and 100),
  fig             jsonb,                     -- [value, caption] or null
  -- Computed by the stories_grade trigger from the meters and source count; never written by clients.
  sources         smallint not null default 0,
  score           smallint not null default 0,
  grade           char(1) not null default 'D' check (grade in ('A', 'B', 'C', 'D')),
  importance      numeric(6, 1) not null default 0,
  created_at      timestamptz not null default now(),
  unique (edition_id, slug),
  unique (edition_id, sort)
);
create index stories_edition_idx on public.stories (edition_id, sort);

create table public.story_sources (
  story_id   bigint not null references public.stories (id) on delete cascade,
  sort       smallint not null,
  outlet_key text not null references public.outlets (key),
  url        text not null check (url like 'https://%'),
  note       text,                           -- e.g. 'headline only'
  primary key (story_id, sort)
);
create index story_sources_outlet_idx on public.story_sources (outlet_key);

create table public.voice_clips (
  story_id      bigint not null references public.stories (id) on delete cascade,
  voice_id      text not null,
  settings_hash text not null,
  path          text not null,
  chars         integer not null,
  created_at    timestamptz not null default now(),
  primary key (story_id, voice_id, settings_hash)
);

create table public.corrections (
  id           bigint generated always as identity primary key,
  story_id     bigint not null references public.stories (id) on delete cascade,
  what_changed text not null,
  created_at   timestamptz not null default now()
);
create index corrections_story_idx on public.corrections (story_id);

-- ---------------------------------------------------------------- grading
-- Must match src/lib/grading.ts and the prototype's gradeStory() exactly,
-- including its floating-point rounding (Math.round = floor(x + 0.5)).
-- Do not change without asking Jonathan.

create function public.dr_story_score(
  corroboration integer, primary_records integer, stability integer, sources integer
) returns integer
language sql immutable parallel safe
set search_path = ''
as $$
  select floor(
      corroboration::float8 * 0.30
    + primary_records::float8 * 0.35
    + (case when sources >= 4 then 85 when sources = 3 then 70 when sources = 2 then 50 else 25 end)::float8 * 0.15
    + stability::float8 * 0.20
    + 0.5
  )::integer
$$;

create function public.dr_grade_for(score integer) returns char(1)
language sql immutable parallel safe
set search_path = ''
as $$
  select case when score >= 85 then 'A' when score >= 70 then 'B' when score >= 55 then 'C' else 'D' end
$$;

-- Touching the row re-runs the stories_grade trigger below.
create function public.dr_refresh_story_grade(target bigint) returns void
language sql
set search_path = ''
as $$
  update public.stories set sources = sources where id = target
$$;

-- Recompute whenever meters change or sources are added/removed.
create function public.dr_stories_grade_trigger() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  select count(*) into n from public.story_sources where story_id = new.id;
  new.sources := n;
  new.score := public.dr_story_score(new.m_corroboration, new.m_primary, new.m_stability, n);
  new.grade := public.dr_grade_for(new.score);
  new.importance := n * 10 + new.score / 10.0;
  return new;
end;
$$;

create trigger stories_grade
  before insert or update on public.stories
  for each row execute function public.dr_stories_grade_trigger();

create function public.dr_story_sources_grade_trigger() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.dr_refresh_story_grade(new.story_id);
  end if;
  if tg_op in ('DELETE', 'UPDATE') and (tg_op = 'DELETE' or old.story_id <> new.story_id) then
    perform public.dr_refresh_story_grade(old.story_id);
  end if;
  return null;
end;
$$;

create trigger story_sources_grade
  after insert or update or delete on public.story_sources
  for each row execute function public.dr_story_sources_grade_trigger();

-- ---------------------------------------------------------------- reader data

create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  topic_order  text[] not null default '{}',
  min_grade    char(1) not null default 'D' check (min_grade in ('A', 'B', 'C', 'D')),
  puzzles_on   jsonb not null default '{}'::jsonb,
  notify_at    time,
  created_at   timestamptz not null default now()
);

create table public.taste (
  user_id uuid not null references auth.users (id) on delete cascade,
  key     text not null check (key ~ '^(sec|sub):'),   -- 'sec:world' | 'sub:world/Europe'
  score   smallint not null default 0 check (score between -10 and 10),
  primary key (user_id, key)
);

create table public.reactions (
  user_id    uuid not null references auth.users (id) on delete cascade,
  story_id   bigint not null references public.stories (id) on delete cascade,
  value      smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, story_id)
);
create index reactions_story_idx on public.reactions (story_id);

create table public.saves (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  story_id   bigint references public.stories (id) on delete set null,
  snapshot   jsonb not null,                -- keeps the save readable forever
  created_at timestamptz not null default now(),
  unique (user_id, story_id)
);
create index saves_story_idx on public.saves (story_id);

create table public.swipes (
  user_id    uuid not null references auth.users (id) on delete cascade,
  edition_id bigint not null references public.editions (id) on delete cascade,
  story_id   bigint not null references public.stories (id) on delete cascade,
  action     text not null check (action in ('more', 'less', 'later')),
  created_at timestamptz not null default now(),
  primary key (user_id, story_id)
);
create index swipes_edition_idx on public.swipes (edition_id);
create index swipes_story_idx on public.swipes (story_id);

create table public.puzzle_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  game    text not null check (game in ('cw', 'su')),
  date    date not null,
  level   smallint not null check (level between 1 and 5),
  state   jsonb not null default '{}'::jsonb,
  done    boolean not null default false,
  secs    integer not null default 0 check (secs >= 0),
  hints   integer not null default 0 check (hints >= 0),
  checks  integer not null default 0 check (checks >= 0),
  primary key (user_id, game, date)
);

create table public.puzzle_level (
  user_id uuid not null references auth.users (id) on delete cascade,
  game    text not null check (game in ('cw', 'su')),
  level   smallint not null check (level between 1 and 5),
  primary key (user_id, game)
);

create table public.feedback (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  edition_id bigint references public.editions (id) on delete set null,
  useful     smallint,
  trust      smallint,
  mode       text,
  pay        text,
  wish       text,
  created_at timestamptz not null default now()
);
create index feedback_user_idx on public.feedback (user_id);
create index feedback_edition_idx on public.feedback (edition_id);

-- ---------------------------------------------------------------- row-level security

alter table public.editions      enable row level security;
alter table public.sections      enable row level security;
alter table public.outlets       enable row level security;
alter table public.stories       enable row level security;
alter table public.story_sources enable row level security;
alter table public.voice_clips   enable row level security;
alter table public.corrections   enable row level security;
alter table public.profiles      enable row level security;
alter table public.taste         enable row level security;
alter table public.reactions     enable row level security;
alter table public.saves         enable row level security;
alter table public.swipes        enable row level security;
alter table public.puzzle_state  enable row level security;
alter table public.puzzle_level  enable row level security;
alter table public.feedback      enable row level security;

-- Public, read-only content.
create policy "published editions are public" on public.editions
  for select to anon, authenticated using (status = 'published');

create policy "sections are public" on public.sections
  for select to anon, authenticated using (true);

create policy "outlets are public" on public.outlets
  for select to anon, authenticated using (true);

create policy "stories in published editions are public" on public.stories
  for select to anon, authenticated using (
    exists (select 1 from public.editions e where e.id = edition_id and e.status = 'published')
  );

create policy "sources of published stories are public" on public.story_sources
  for select to anon, authenticated using (
    exists (
      select 1 from public.stories s join public.editions e on e.id = s.edition_id
      where s.id = story_id and e.status = 'published'
    )
  );

create policy "clips of published stories are public" on public.voice_clips
  for select to anon, authenticated using (
    exists (
      select 1 from public.stories s join public.editions e on e.id = s.edition_id
      where s.id = story_id and e.status = 'published'
    )
  );

create policy "corrections are public" on public.corrections
  for select to anon, authenticated using (true);

-- Reader-owned rows: signed-in readers see and change only their own.
create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own taste" on public.taste
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own reactions" on public.reactions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own saves" on public.saves
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own swipes" on public.swipes
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own puzzle state" on public.puzzle_state
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own puzzle level" on public.puzzle_level
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Feedback can be sent and read back, not edited.
create policy "read own feedback" on public.feedback
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "send own feedback" on public.feedback
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- The grading helpers are internal; clients have no reason to call them.
revoke execute on function public.dr_refresh_story_grade(bigint) from public, anon, authenticated;
revoke execute on function public.dr_stories_grade_trigger() from public, anon, authenticated;
revoke execute on function public.dr_story_sources_grade_trigger() from public, anon, authenticated;
