-- Spoken scripts: each story rewritten for the ear (same facts, shorter sentences), which the
-- newsreaders read in place of the written report. Saved by the load-edition script after
-- dr_load_edition, only when the script passes the facts check in src/lib/spoken.ts.
alter table public.stories add column if not exists spoken text[];

-- Names the newsreaders met that their dictionary doesn't know, for checking by ear.
-- Written by the voice job (service role) only.
create table if not exists public.voice_names (
  word       text primary key,
  seen       integer not null default 1,
  last_seen  date not null default current_date,
  example    text
);
alter table public.voice_names enable row level security;
revoke all on public.voice_names from public, anon, authenticated;
