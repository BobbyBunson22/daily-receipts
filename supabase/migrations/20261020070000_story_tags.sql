-- Story tags (people, organisations, places, topics) so the app can learn from each swipe
-- about that story rather than its whole section, and readers' taste for each tag.
-- Tags are written by the morning edition (scripts/load-edition.ts saves them); they never
-- affect grades.

alter table public.stories add column if not exists tags jsonb not null default '[]'::jsonb
  constraint stories_tags_check check (jsonb_typeof(tags) = 'array' and jsonb_array_length(tags) <= 12);
alter table public.taste drop constraint if exists taste_key_check;
alter table public.taste add constraint taste_key_check check (key ~ '^(sec|sub|tag):' and length(key) <= 80);
