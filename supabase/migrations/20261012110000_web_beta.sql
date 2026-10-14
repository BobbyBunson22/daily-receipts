-- Daily Receipts: web beta.
--
--   * profiles are created automatically at sign-up
--   * events: what readers do (opens, swipes, plays), for return rates and funnels.
--     Anyone can add an event; nobody can read them except through the admin reports.
--   * feedback: open to everyone (signed in or not), one answer set per reader per edition
--   * admins: who can see the admin reports
--   * dr_load_edition: the only way an edition gets in, called by the server job with the
--     service role. Re-running it for the same issue updates stories in place, so readers'
--     likes, saves and swipes on that edition survive a re-run.

-- ---------------------------------------------------------------- admins

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create policy "admins can see that they are admins" on public.admins
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- profiles at sign-up

-- Emails that become admins when they sign up. Filled in directly in the database, never in the repo.
create table public.admin_invites (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.admin_invites enable row level security;   -- no policies: clients can't see it

create function public.dr_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  if new.email is not null and exists (select 1 from public.admin_invites where email = lower(new.email)) then
    insert into public.admins (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.dr_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.dr_new_user();

insert into public.profiles (user_id) select id from auth.users on conflict do nothing;

alter table public.profiles add column mode text not null default 'swipe' check (mode in ('swipe', 'scroll'));
alter table public.profiles add column updated_at timestamptz not null default now();

create function public.dr_is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
$$;
revoke execute on function public.dr_is_admin() from public, anon;
grant execute on function public.dr_is_admin() to authenticated;

-- ---------------------------------------------------------------- events

create table public.events (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  anon_id    text not null check (anon_id ~ '^[A-Za-z0-9_-]{8,64}$'),   -- one per browser
  user_id    uuid default auth.uid() references auth.users (id) on delete set null,
  name       text not null check (name in (
               'open', 'swipe', 'deck_done', 'restart', 'story_open', 'source_click',
               'roundup_open', 'roundup_play', 'roundup_done', 'save', 'unsave',
               'mode', 'settings', 'signup_start', 'signin', 'signout', 'feedback',
               'install', 'share')),
  edition_id bigint references public.editions (id) on delete set null,
  story_id   bigint references public.stories (id) on delete set null,
  props      jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 2000)
);
create index events_at_idx on public.events (at);
create index events_anon_idx on public.events (anon_id);
create index events_user_idx on public.events (user_id);
create index events_name_idx on public.events (name, at);
create index events_edition_idx on public.events (edition_id);
create index events_story_idx on public.events (story_id);

alter table public.events enable row level security;
create policy "anyone can add events" on public.events
  for insert to anon, authenticated
  with check (user_id is not distinct from (select auth.uid()) and at > now() - interval '5 minutes' and at < now() + interval '5 minutes');

-- ---------------------------------------------------------------- feedback from anyone

alter table public.feedback alter column user_id drop not null;
alter table public.feedback add column anon_id text check (anon_id ~ '^[A-Za-z0-9_-]{8,64}$');
alter table public.feedback add column updated_at timestamptz not null default now();
alter table public.feedback add constraint feedback_who check (user_id is not null or anon_id is not null);
alter table public.feedback add constraint feedback_useful check (useful between 1 and 5);
alter table public.feedback add constraint feedback_trust check (trust in (0, 1, 2));         -- no, partly, yes
alter table public.feedback add constraint feedback_mode check (mode in ('swipe', 'scroll', 'both'));
alter table public.feedback add constraint feedback_pay check (pay in ('yes', 'maybe', 'no'));
alter table public.feedback add constraint feedback_wish check (char_length(wish) <= 1000);
create unique index feedback_user_edition on public.feedback (user_id, edition_id) where user_id is not null;
create unique index feedback_anon_edition on public.feedback (anon_id, edition_id) where user_id is null;

drop policy "send own feedback" on public.feedback;
create policy "send feedback" on public.feedback
  for insert to anon, authenticated
  with check (user_id is not distinct from (select auth.uid()));
create policy "change own feedback" on public.feedback
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Readers who are not signed in can't read rows back, so they send answers through this,
-- which inserts or updates their one row for the edition.
create function public.dr_send_feedback(
  p_anon_id text, p_edition_id bigint, p_useful smallint, p_trust smallint,
  p_mode text, p_pay text, p_wish text
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if p_anon_id !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'bad anon id'; end if;
  if not exists (select 1 from public.editions where id = p_edition_id and status = 'published') then
    raise exception 'unknown edition';
  end if;
  if uid is not null then
    insert into public.feedback (user_id, anon_id, edition_id, useful, trust, mode, pay, wish)
    values (uid, p_anon_id, p_edition_id, p_useful, p_trust, p_mode, p_pay, nullif(btrim(p_wish), ''))
    on conflict (user_id, edition_id) where user_id is not null
    do update set useful = excluded.useful, trust = excluded.trust, mode = excluded.mode,
                  pay = excluded.pay, wish = excluded.wish, updated_at = now();
  else
    insert into public.feedback (anon_id, edition_id, useful, trust, mode, pay, wish)
    values (p_anon_id, p_edition_id, p_useful, p_trust, p_mode, p_pay, nullif(btrim(p_wish), ''))
    on conflict (anon_id, edition_id) where user_id is null
    do update set useful = excluded.useful, trust = excluded.trust, mode = excluded.mode,
                  pay = excluded.pay, wish = excluded.wish, updated_at = now();
  end if;
end;
$$;
revoke execute on function public.dr_send_feedback(text, bigint, smallint, smallint, text, text, text) from public;
grant execute on function public.dr_send_feedback(text, bigint, smallint, smallint, text, text, text) to anon, authenticated;

-- When someone signs in, claim what they did before signing in on this browser.
create function public.dr_claim_device(p_anon_id text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or p_anon_id !~ '^[A-Za-z0-9_-]{8,64}$' then return; end if;
  update public.events set user_id = uid where anon_id = p_anon_id and user_id is null;
  update public.feedback f set user_id = uid
    where f.anon_id = p_anon_id and f.user_id is null
      and not exists (select 1 from public.feedback g where g.user_id = uid and g.edition_id = f.edition_id);
end;
$$;
revoke execute on function public.dr_claim_device(text) from public, anon;
grant execute on function public.dr_claim_device(text) to authenticated;

-- ---------------------------------------------------------------- loading an edition

create function public.dr_load_edition(e jsonb, publish boolean default true) returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  ed_id bigint;
  st    jsonb;
  st_id bigint;
  i     integer := 0;
  j     integer;
  src   jsonb;
  label text := e #>> '{edition,date}';
  months text[] := array['january','february','march','april','may','june','july','august','september','october','november','december'];
  m     text[];
  d     date;
  c     text[];
  compiled timestamptz;
begin
  m := regexp_match(label, '(\d{1,2}) ([A-Za-z]+) (\d{4})');
  if m is null or array_position(months, lower(m[2])) is null then raise exception 'bad edition date %', label; end if;
  d := make_date(m[3]::int, array_position(months, lower(m[2])), m[1]::int);
  c := regexp_match(e #>> '{edition,compiled}', '^(\d{2}):(\d{2}) (BST|GMT|UTC)');
  if c is null then raise exception 'bad compile time %', e #>> '{edition,compiled}'; end if;
  compiled := (d::text || ' ' || c[1] || ':' || c[2] || case c[3] when 'BST' then '+01' else '+00' end)::timestamptz;

  insert into public.sections (id, name, subs, sort)
  select s->>'id', s->>'name', array(select jsonb_array_elements_text(s->'subs')), (ord - 1)::smallint
  from jsonb_array_elements(e->'sections') with ordinality as t(s, ord)
  on conflict (id) do update set name = excluded.name, subs = excluded.subs, sort = excluded.sort;

  insert into public.outlets (key, name, country)
  select k, v->>'name', v->>'country' from jsonb_each(e->'outlets') as t(k, v)
  on conflict (key) do update set name = excluded.name, country = excluded.country;

  insert into public.editions (issue, date, date_label, compiled_at, status)
  values ((e #>> '{edition,issue}')::int, d, label, compiled, case when publish then 'published' else 'draft' end)
  on conflict (issue) do update set date = excluded.date, date_label = excluded.date_label,
    compiled_at = excluded.compiled_at, status = excluded.status
  returning id into ed_id;

  -- park existing sort values so the new order can't collide
  update public.stories set sort = -sort - 1 where edition_id = ed_id;
  delete from public.stories
  where edition_id = ed_id
    and slug not in (select x->>'id' from jsonb_array_elements(e->'stories') as t(x));

  for st in select x from jsonb_array_elements(e->'stories') as t(x) loop
    insert into public.stories (edition_id, slug, sort, sec, sub, head, say, stand, body, kept, cut, open,
                                primary_sources, m_corroboration, m_primary, m_stability, fig)
    values (ed_id, st->>'id', i, st->>'sec', st->>'sub', st->>'head', st->>'say', st->>'stand',
            array(select jsonb_array_elements_text(st->'body')), st->'kept', coalesce(st->'cut', '[]'::jsonb),
            array(select jsonb_array_elements_text(coalesce(st->'open', '[]'::jsonb))),
            array(select jsonb_array_elements_text(coalesce(st->'primary', '[]'::jsonb))),
            (st #>> '{m,0}')::smallint, (st #>> '{m,1}')::smallint, (st #>> '{m,2}')::smallint,
            case when jsonb_typeof(st->'fig') = 'array' then st->'fig' else null end)
    on conflict (edition_id, slug) do update set sort = excluded.sort, sec = excluded.sec, sub = excluded.sub,
      head = excluded.head, say = excluded.say, stand = excluded.stand, body = excluded.body, kept = excluded.kept,
      cut = excluded.cut, open = excluded.open, primary_sources = excluded.primary_sources,
      m_corroboration = excluded.m_corroboration, m_primary = excluded.m_primary,
      m_stability = excluded.m_stability, fig = excluded.fig
    returning id into st_id;

    delete from public.story_sources where story_id = st_id;
    j := 0;
    for src in select x from jsonb_array_elements(st->'src') as t(x) loop
      insert into public.story_sources (story_id, sort, outlet_key, url, note)
      values (st_id, j, src->>0, src->>1, src->>2);
      j := j + 1;
    end loop;
    perform public.dr_refresh_story_grade(st_id);
    i := i + 1;
  end loop;

  return ed_id;
end;
$$;
revoke execute on function public.dr_load_edition(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.dr_load_edition(jsonb, boolean) to service_role;

-- ---------------------------------------------------------------- admin reports
-- Each checks the caller is an admin. Days are London days.

create function public.dr_admin_overview(days integer default 14) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.dr_is_admin() then raise exception 'not allowed'; end if;

  with ident as (
    select anon_id, (array_agg(user_id::text) filter (where user_id is not null))[1] as uid
    from public.events group by anon_id
  ),
  ev as (
    select e.*, coalesce(i.uid, e.anon_id) as who, (e.at at time zone 'Europe/London')::date as day
    from public.events e join ident i using (anon_id)
  ),
  daily as (select distinct who, day from ev where name = 'open'),
  window_days as (
    select generate_series((now() at time zone 'Europe/London')::date - (days - 1),
                           (now() at time zone 'Europe/London')::date, interval '1 day')::date as day
  ),
  series as (
    select w.day,
      (select count(distinct who) from daily d where d.day = w.day) as visitors,
      (select count(*) from auth.users u where (u.created_at at time zone 'Europe/London')::date = w.day) as signups,
      (select count(*) from ev where ev.day = w.day and name = 'swipe') as swipes,
      (select count(*) from ev where ev.day = w.day and name = 'roundup_play') as plays,
      (select count(distinct who) from ev where ev.day = w.day and name = 'deck_done') as finished
    from window_days w
  ),
  -- A visit counts towards "next day" once that next day is over, and towards "within a week" once the week is over.
  visits as (
    select a.day + 1 < (now() at time zone 'Europe/London')::date as elig_n,
           a.day + 7 < (now() at time zone 'Europe/London')::date as elig_w,
           exists (select 1 from daily b where b.who = a.who and b.day = a.day + 1) as back_n,
           exists (select 1 from daily b where b.who = a.who and b.day between a.day + 1 and a.day + 7) as back_w
    from daily a
    where a.day >= (now() at time zone 'Europe/London')::date - (days + 7)
  ),
  ret as (
    select count(*) filter (where elig_n) as en, count(*) filter (where elig_n and back_n) as bn,
           count(*) filter (where elig_w) as ew, count(*) filter (where elig_w and back_w) as bw
    from visits
  ),
  fb as (select * from public.feedback)
  select jsonb_build_object(
    'people', jsonb_build_object(
      'accounts', (select count(*) from auth.users),
      'accounts_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'visitors_all', (select count(distinct who) from daily),
      'visitors_today', (select count(distinct who) from daily where day = (now() at time zone 'Europe/London')::date),
      'visitors_7d', (select count(distinct who) from daily where day > (now() at time zone 'Europe/London')::date - 7),
      'installed', (select count(distinct who) from ev where name = 'open' and (props->>'standalone')::boolean)
    ),
    'returns', (select jsonb_build_object(
      'next_day', case when en > 0 then round(100.0 * bn / en) end, 'next_day_base', en,
      'week', case when ew > 0 then round(100.0 * bw / ew) end, 'week_base', ew) from ret),
    'engagement', jsonb_build_object(
      'sessions_7d', (select count(*) from ev where name = 'open' and at > now() - interval '7 days'),
      'deck_done_rate', (select case when count(*) filter (where name = 'open') > 0
                           then round(100.0 * count(distinct (who, day)) filter (where name = 'deck_done')
                                      / nullif(count(distinct (who, day)) filter (where name = 'open'), 0)) end
                         from ev where at > now() - interval '7 days'),
      'swipes_per_visit', (select round(count(*) filter (where name = 'swipe')::numeric
                             / nullif(count(distinct (who, day)) filter (where name = 'open'), 0), 1)
                           from ev where at > now() - interval '7 days'),
      'likes_per_visit', (select round(count(*) filter (where name = 'swipe' and props->>'action' = 'more')::numeric
                             / nullif(count(distinct (who, day)) filter (where name = 'open'), 0), 1)
                           from ev where at > now() - interval '7 days'),
      'swipe_split', (select jsonb_object_agg(a, n) from (select props->>'action' a, count(*) n from ev
                       where name = 'swipe' and at > now() - interval '7 days' group by 1) x),
      'mode_split', (select jsonb_object_agg(m, n) from (select coalesce(props->>'mode', 'swipe') m, count(*) n from ev
                       where name = 'open' and at > now() - interval '7 days' group by 1) x),
      'roundup_plays_7d', (select count(*) from ev where name = 'roundup_play' and at > now() - interval '7 days'),
      'roundup_finished_7d', (select count(*) from ev where name = 'roundup_done' and at > now() - interval '7 days'),
      'stories_opened_7d', (select count(*) from ev where name = 'story_open' and at > now() - interval '7 days'),
      'sources_clicked_7d', (select count(*) from ev where name = 'source_click' and at > now() - interval '7 days'),
      'saves_7d', (select count(*) from ev where name = 'save' and at > now() - interval '7 days')
    ),
    'feedback', jsonb_build_object(
      'answers', (select count(*) from fb),
      'useful_avg', (select round(avg(useful), 1) from fb),
      'trust', (select jsonb_object_agg(k, n) from (select case trust when 2 then 'yes' when 1 then 'partly' when 0 then 'no' end k, count(*) n from fb where trust is not null group by 1) x),
      'pay', (select jsonb_object_agg(pay, n) from (select pay, count(*) n from fb where pay is not null group by 1) x),
      'mode', (select jsonb_object_agg(mode, n) from (select mode, count(*) n from fb where mode is not null group by 1) x)
    ),
    'daily', (select jsonb_agg(jsonb_build_object('day', day, 'visitors', visitors, 'signups', signups,
                'swipes', swipes, 'plays', plays, 'finished', finished) order by day) from series),
    'sections', (select jsonb_agg(jsonb_build_object('sec', sec, 'likes', likes, 'skips', skips, 'saves', saves) order by likes - skips desc)
                 from (select s.sec,
                         count(*) filter (where e.props->>'action' = 'more') likes,
                         count(*) filter (where e.props->>'action' = 'less') skips,
                         count(*) filter (where e.props->>'action' = 'later') saves
                       from ev e join public.stories s on s.id = e.story_id
                       where e.name = 'swipe' and e.at > now() - interval '14 days' group by s.sec) x)
  ) into result;
  return result;
end;
$$;

create function public.dr_admin_feedback(lim integer default 100) returns table (
  at timestamptz, who text, signed_in boolean, issue integer, useful smallint, trust text, mode text, pay text, wish text
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.dr_is_admin() then raise exception 'not allowed'; end if;
  return query
    select f.updated_at, coalesce(u.email::text, 'Reader ' || left(f.anon_id, 6)), f.user_id is not null, e.issue,
           f.useful, case f.trust when 2 then 'yes' when 1 then 'partly' when 0 then 'no' end, f.mode, f.pay, f.wish
    from public.feedback f
    left join auth.users u on u.id = f.user_id
    left join public.editions e on e.id = f.edition_id
    order by f.updated_at desc
    limit lim;
end;
$$;

create function public.dr_admin_people(lim integer default 200) returns table (
  email text, joined timestamptz, last_seen timestamptz, days_active bigint, swipes bigint, likes bigint,
  saves bigint, plays bigint, feedback bigint, top_sections text
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.dr_is_admin() then raise exception 'not allowed'; end if;
  return query
    select u.email::text, u.created_at,
      (select max(e.at) from public.events e where e.user_id = u.id),
      (select count(distinct (e.at at time zone 'Europe/London')::date) from public.events e where e.user_id = u.id and e.name = 'open'),
      (select count(*) from public.events e where e.user_id = u.id and e.name = 'swipe'),
      (select count(*) from public.events e where e.user_id = u.id and e.name = 'swipe' and e.props->>'action' = 'more'),
      (select count(*) from public.saves s where s.user_id = u.id),
      (select count(*) from public.events e where e.user_id = u.id and e.name = 'roundup_play'),
      (select count(*) from public.feedback f where f.user_id = u.id),
      (select string_agg(replace(t.key, 'sec:', ''), ', ' order by t.score desc)
         from (select key, score from public.taste t where t.user_id = u.id and key like 'sec:%' and score > 0 order by score desc limit 3) t)
    from auth.users u
    order by 3 desc nulls last, u.created_at desc
    limit lim;
end;
$$;

create function public.dr_admin_stories(p_issue integer default null) returns table (
  issue integer, slug text, head text, sec text, grade char(1), importance numeric,
  shown bigint, likes bigint, skips bigint, saves bigint, opens bigint
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.dr_is_admin() then raise exception 'not allowed'; end if;
  return query
    with ed as (
      select e.id, e.issue from public.editions e
      where e.status = 'published' and (p_issue is null or e.issue = p_issue)
      order by e.issue desc limit 1
    )
    select ed.issue, s.slug, s.head, s.sec, s.grade, s.importance,
      count(*) filter (where ev.name = 'swipe'),
      count(*) filter (where ev.name = 'swipe' and ev.props->>'action' = 'more'),
      count(*) filter (where ev.name = 'swipe' and ev.props->>'action' = 'less'),
      count(*) filter (where ev.name = 'swipe' and ev.props->>'action' = 'later'),
      count(*) filter (where ev.name = 'story_open')
    from ed join public.stories s on s.edition_id = ed.id
    left join public.events ev on ev.story_id = s.id
    group by ed.issue, s.id
    order by count(*) filter (where ev.name = 'swipe' and ev.props->>'action' = 'more') desc, s.importance desc;
end;
$$;

revoke execute on function public.dr_admin_overview(integer) from public, anon;
revoke execute on function public.dr_admin_feedback(integer) from public, anon;
revoke execute on function public.dr_admin_people(integer) from public, anon;
revoke execute on function public.dr_admin_stories(integer) from public, anon;
grant execute on function public.dr_admin_overview(integer) to authenticated;
grant execute on function public.dr_admin_feedback(integer) to authenticated;
grant execute on function public.dr_admin_people(integer) to authenticated;
grant execute on function public.dr_admin_stories(integer) to authenticated;
