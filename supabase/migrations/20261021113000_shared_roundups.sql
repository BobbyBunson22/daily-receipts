-- Shared roundups: "Jay's roundup" as a link. A roundup is today's edition, the stories in the
-- order the reader liked them, the newsreader choice and an optional name. Created only through
-- dr_share_roundup, which checks every story belongs to the edition; readable by anyone with the code.
create table if not exists public.shared_roundups (
  code        text primary key,
  edition_id  bigint not null references public.editions (id) on delete cascade,
  story_ids   bigint[] not null check (cardinality(story_ids) between 1 and 30),
  voice       text not null check (voice in ('george', 'emma', 'both')),
  name        text check (name is null or char_length(name) between 1 and 20),
  created_at  timestamptz not null default now()
);
alter table public.shared_roundups enable row level security;
revoke all on public.shared_roundups from public, anon, authenticated;
grant select on public.shared_roundups to anon, authenticated;
create policy "shared roundups are public" on public.shared_roundups for select to anon, authenticated using (true);

create or replace function public.dr_share_roundup(p_edition bigint, p_stories bigint[], p_voice text, p_name text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
  v_code text;
  v_flat text;
begin
  if not exists (select 1 from editions where id = p_edition and status = 'published') then
    raise exception 'unknown edition';
  end if;
  if p_stories is null or cardinality(p_stories) < 1 or cardinality(p_stories) > 30 then
    raise exception 'a roundup has 1 to 30 stories';
  end if;
  if (select count(distinct x) from unnest(p_stories) x) <> cardinality(p_stories)
     or exists (select 1 from unnest(p_stories) x where not exists (select 1 from stories s where s.id = x and s.edition_id = p_edition)) then
    raise exception 'stories must be from that edition';
  end if;
  if p_voice not in ('george', 'emma', 'both') then raise exception 'unknown voice'; end if;
  if v_name is not null then
    if char_length(v_name) > 20 or v_name !~ '^[[:alpha:][:digit:] .''’-]+$' then raise exception 'name not allowed'; end if;
    v_flat := lower(regexp_replace(v_name, '[^[:alpha:]]', '', 'g'));
    -- names show on public previews: no obvious abuse
    if v_flat ~ '(fuck|cunt|nigg|faggot|retard|wank|twat|shit|bitch|whore|slut|nazi|hitler|rapist)' then v_name := null; end if;
  end if;
  -- the same roundup shared again gets the same link
  select code into v_code from shared_roundups
    where edition_id = p_edition and story_ids = p_stories and voice = p_voice and name is not distinct from v_name;
  if v_code is not null then return v_code; end if;
  loop
    v_code := translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/=', 'xyz');
    begin
      insert into shared_roundups (code, edition_id, story_ids, voice, name) values (v_code, p_edition, p_stories, p_voice, v_name);
      return v_code;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
end;
$$;
revoke all on function public.dr_share_roundup(bigint, bigint[], text, text) from public;
grant execute on function public.dr_share_roundup(bigint, bigint[], text, text) to anon, authenticated;
