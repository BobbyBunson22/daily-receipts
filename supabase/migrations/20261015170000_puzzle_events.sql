-- Let the app record puzzle plays, and give the admin a per-puzzle summary.
alter table public.events drop constraint events_name_check;
alter table public.events add constraint events_name_check check (name in (
  'open', 'swipe', 'deck_done', 'restart', 'story_open', 'source_click',
  'roundup_open', 'roundup_play', 'roundup_done', 'save', 'unsave',
  'mode', 'settings', 'signup_start', 'signin', 'signout', 'feedback',
  'install', 'share', 'puzzle_start', 'puzzle_done'));

create function public.dr_admin_puzzles(days integer default 14) returns table (
  game text, started bigint, finished bigint, solved bigint, revealed bigint, players bigint, avg_secs numeric
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.dr_is_admin() then raise exception 'not allowed'; end if;
  return query
    select e.props->>'game',
      count(*) filter (where e.name = 'puzzle_start'),
      count(*) filter (where e.name = 'puzzle_done'),
      count(*) filter (where e.name = 'puzzle_done' and e.props->>'how' = 'solved'),
      count(*) filter (where e.name = 'puzzle_done' and e.props->>'how' = 'revealed'),
      count(distinct coalesce(e.user_id::text, e.anon_id)),
      round(avg((e.props->>'secs')::numeric) filter (where e.name = 'puzzle_done' and e.props ? 'secs'))
    from public.events e
    where e.name in ('puzzle_start', 'puzzle_done') and e.at > now() - make_interval(days => days)
    group by 1 order by 2 desc;
end;
$$;
revoke execute on function public.dr_admin_puzzles(integer) from public, anon;
grant execute on function public.dr_admin_puzzles(integer) to authenticated;
