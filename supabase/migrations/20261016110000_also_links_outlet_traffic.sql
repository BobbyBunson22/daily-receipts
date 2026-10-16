-- "Also reported by": other outlets' articles on the same story, linked for further reading.
-- They are not sources: they sit in their own column, so the grade (which counts story_sources)
-- never sees them. Plus a per-outlet traffic report for the admin page: how often each outlet
-- was offered to readers and how often readers clicked through.

alter table public.stories add column also jsonb not null default '[]'::jsonb
  constraint stories_also_check check (jsonb_typeof(also) = 'array' and jsonb_array_length(also) <= 8);

create or replace function public.dr_load_edition(e jsonb, publish boolean default true) returns bigint
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
                                primary_sources, m_corroboration, m_primary, m_stability, fig, also)
    values (ed_id, st->>'id', i, st->>'sec', st->>'sub', st->>'head', st->>'say', st->>'stand',
            array(select jsonb_array_elements_text(st->'body')), st->'kept', coalesce(st->'cut', '[]'::jsonb),
            array(select jsonb_array_elements_text(coalesce(st->'open', '[]'::jsonb))),
            array(select jsonb_array_elements_text(coalesce(st->'primary', '[]'::jsonb))),
            (st #>> '{m,0}')::smallint, (st #>> '{m,1}')::smallint, (st #>> '{m,2}')::smallint,
            case when jsonb_typeof(st->'fig') = 'array' then st->'fig' else null end,
            case when jsonb_typeof(st->'also') = 'array' then st->'also' else '[]'::jsonb end)
    on conflict (edition_id, slug) do update set sort = excluded.sort, sec = excluded.sec, sub = excluded.sub,
      head = excluded.head, say = excluded.say, stand = excluded.stand, body = excluded.body, kept = excluded.kept,
      cut = excluded.cut, open = excluded.open, primary_sources = excluded.primary_sources,
      m_corroboration = excluded.m_corroboration, m_primary = excluded.m_primary,
      m_stability = excluded.m_stability, fig = excluded.fig, also = excluded.also
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

-- ---------------------------------------------------------------- traffic sent to each outlet

create function public.dr_admin_outlets(days integer default 30) returns table (
  outlet text, name text, offered bigint, clicks bigint, also_clicks bigint, readers bigint
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.dr_is_admin() then raise exception 'not allowed'; end if;
  return query
    with opens as (
      select e.story_id, count(*) as n from public.events e
      where e.name = 'story_open' and e.story_id is not null and e.at > now() - make_interval(days => days)
      group by 1
    ), links as (
      select ss.story_id, ss.outlet_key as outlet from public.story_sources ss
      union
      select s.id, a->>0 from public.stories s, jsonb_array_elements(s.also) as a
    ), offered as (
      select l.outlet, sum(o.n)::bigint as n from links l join opens o using (story_id) group by 1
    ), clicked as (
      select e.props->>'outlet' as outlet, count(*) as clicks,
        count(*) filter (where e.props->>'kind' = 'also') as also_clicks,
        count(distinct coalesce(e.user_id::text, e.anon_id)) as readers
      from public.events e
      where e.name = 'source_click' and e.props ? 'outlet' and e.at > now() - make_interval(days => days)
      group by 1
    )
    select k.outlet, coalesce(o.name, k.outlet), coalesce(f.n, 0), coalesce(c.clicks, 0), coalesce(c.also_clicks, 0), coalesce(c.readers, 0)
    from (select x.outlet from offered x union select y.outlet from clicked y) k
    left join offered f on f.outlet = k.outlet
    left join clicked c on c.outlet = k.outlet
    left join public.outlets o on o.key = k.outlet
    order by 4 desc, 3 desc
    limit 300;
end;
$$;
revoke execute on function public.dr_admin_outlets(integer) from public, anon;
grant execute on function public.dr_admin_outlets(integer) to authenticated;
