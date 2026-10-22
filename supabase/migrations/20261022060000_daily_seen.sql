-- The daily fact and question pop up once a day per reader, on whichever device: the day it
-- was last shown is kept on the account.
alter table public.profiles add column if not exists daily_seen date;
grant insert (daily_seen), update (daily_seen) on public.profiles to authenticated;
