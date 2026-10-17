-- The daily question: one answer per signed-in reader per London day. Each correct answer is a
-- gold DR token, so a reader's tokens are simply their correct rows. Readers can add and read
-- only their own answers, and can't change an answer once given.

create table public.daily_answers (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day     date not null,
  result  text not null check (result in ('correct', 'wrong', 'dontknow')),
  at      timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_answers enable row level security;

create policy "readers see their own daily answers" on public.daily_answers
  for select to authenticated using (user_id = auth.uid());
create policy "readers add their own daily answers" on public.daily_answers
  for insert to authenticated with check (user_id = auth.uid() and day <= (now() at time zone 'Europe/London')::date + 1);

revoke all on public.daily_answers from public, anon, authenticated;
grant select, insert on public.daily_answers to authenticated;

-- Admin: how the daily question is going, per day.
create function public.dr_admin_daily(days integer default 14) returns table (
  day date, answered bigint, correct bigint, dontknow bigint
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.dr_is_admin() then raise exception 'not allowed'; end if;
  return query
    select a.day, count(*), count(*) filter (where a.result = 'correct'), count(*) filter (where a.result = 'dontknow')
    from public.daily_answers a
    where a.day > (now() at time zone 'Europe/London')::date - days
    group by 1 order by 1 desc;
end;
$$;
revoke execute on function public.dr_admin_daily(integer) from public, anon;
grant execute on function public.dr_admin_daily(integer) to authenticated;
