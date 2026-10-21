-- Securing a username: a signed-in reader claims a unique username ("jay" -> Jay's Receipts).
-- The first claim earns 5 gold DR tokens, once (token_awards). Readers see only their own awards.
alter table public.profiles add column if not exists username text check (username is null or char_length(username) between 2 and 20);
create unique index if not exists profiles_username_key on public.profiles (lower(username)) where username is not null;

create table if not exists public.token_awards (
  user_id    uuid not null references auth.users (id) on delete cascade,
  reason     text not null,
  amount     integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, reason)
);
alter table public.token_awards enable row level security;
revoke all on public.token_awards from public, anon, authenticated;
grant select on public.token_awards to authenticated;
create policy "own token awards" on public.token_awards for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.dr_username_problem(p_name text) returns text
language plpgsql immutable set search_path = public
as $$
declare v_flat text := lower(regexp_replace(coalesce(p_name, ''), '[^[:alpha:]]', '', 'g'));
begin
  if p_name is null or char_length(p_name) < 2 then return 'too short'; end if;
  if char_length(p_name) > 20 then return 'too long'; end if;
  if p_name !~ '^[[:alpha:][:digit:]][[:alpha:][:digit:] .''’-]*$' then return 'letters, numbers, spaces and - . '' only'; end if;
  if v_flat ~ '(fuck|cunt|nigg|faggot|retard|wank|twat|shit|bitch|whore|slut|nazi|hitler|rapist)' then return 'not allowed'; end if;
  if lower(p_name) in ('admin', 'administrator', 'daily receipts', 'dailyreceipts', 'receipts', 'support', 'help', 'george', 'emma', 'moderator', 'official') then return 'reserved'; end if;
  return null;
end;
$$;

create or replace function public.dr_username_available(p_name text) returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_problem text := public.dr_username_problem(v_name);
begin
  if v_problem is not null then return v_problem; end if;
  if exists (select 1 from profiles where lower(username) = lower(v_name) and user_id is distinct from auth.uid()) then return 'taken'; end if;
  return 'ok';
end;
$$;

create or replace function public.dr_claim_username(p_name text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_status text := public.dr_username_available(v_name);
  v_awarded integer := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'sign in'); end if;
  if v_status <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_status); end if;
  insert into profiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  begin
    update profiles set username = v_name, display_name = v_name where user_id = v_uid;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end;
  insert into token_awards (user_id, reason, amount) values (v_uid, 'username', 5) on conflict do nothing;
  get diagnostics v_awarded = row_count;
  return jsonb_build_object('ok', true, 'name', v_name, 'awarded', case when v_awarded > 0 then 5 else 0 end);
end;
$$;

revoke all on function public.dr_username_problem(text) from public, anon, authenticated;
revoke all on function public.dr_username_available(text) from public;
revoke all on function public.dr_claim_username(text) from public, anon;
grant execute on function public.dr_username_available(text) to anon, authenticated;
grant execute on function public.dr_claim_username(text) to authenticated;
