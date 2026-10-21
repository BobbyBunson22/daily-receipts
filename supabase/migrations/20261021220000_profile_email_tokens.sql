-- Profiles hold who someone is and what they've won: their email (kept in step with sign-in)
-- and their gold DR tokens (correct daily answers plus awards), both maintained by the database.
-- Readers may change only their own choices, never their tokens, email or secured username.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists gold_tokens integer not null default 0 check (gold_tokens >= 0);

create or replace function public.dr_refresh_tokens(p_user uuid) returns void
language sql security definer set search_path = ''
as $$
  update public.profiles p set gold_tokens =
    (select count(*) from public.daily_answers d where d.user_id = p_user and d.result = 'correct')
    + coalesce((select sum(t.amount) from public.token_awards t where t.user_id = p_user), 0)
  where p.user_id = p_user;
$$;
revoke all on function public.dr_refresh_tokens(uuid) from public, anon, authenticated;

create or replace function public.dr_tokens_changed() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.dr_refresh_tokens(old.user_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform public.dr_refresh_tokens(new.user_id); end if;
  return null;
end;
$$;
revoke all on function public.dr_tokens_changed() from public, anon, authenticated;
drop trigger if exists daily_answers_tokens on public.daily_answers;
create trigger daily_answers_tokens after insert or update or delete on public.daily_answers for each row execute function public.dr_tokens_changed();
drop trigger if exists token_awards_tokens on public.token_awards;
create trigger token_awards_tokens after insert or update or delete on public.token_awards for each row execute function public.dr_tokens_changed();

revoke insert, update on public.profiles from anon, authenticated;
grant insert (user_id, topic_order, min_grade, mode, deck_size, voice, display_name, updated_at, puzzles_on, notify_at) on public.profiles to authenticated;
-- user_id too: the app saves with an upsert, which writes back the (unchanged) id; RLS keeps it their own
grant update (user_id, topic_order, min_grade, mode, deck_size, voice, display_name, updated_at, puzzles_on, notify_at) on public.profiles to authenticated;

create or replace function public.dr_user_email() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email = new.email where user_id = new.id;
  return new;
end;
$$;
revoke all on function public.dr_user_email() from public, anon, authenticated;
drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after insert or update of email on auth.users for each row execute function public.dr_user_email();

update public.profiles p set email = u.email from auth.users u where u.id = p.user_id;
select public.dr_refresh_tokens(user_id) from public.profiles;
