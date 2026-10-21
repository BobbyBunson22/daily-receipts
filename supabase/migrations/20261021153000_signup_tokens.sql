-- 10 gold DR tokens for signing up, paid once by the server when an account is created.
-- Readers who signed up before this get theirs too.
create or replace function public.dr_signup_award() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.token_awards (user_id, reason, amount) values (new.id, 'signup', 10) on conflict do nothing;
  return new;
end;
$$;
revoke execute on function public.dr_signup_award() from public, anon, authenticated;
drop trigger if exists on_auth_user_signup_award on auth.users;
create trigger on_auth_user_signup_award after insert on auth.users for each row execute function public.dr_signup_award();
insert into public.token_awards (user_id, reason, amount) select id, 'signup', 10 from auth.users on conflict do nothing;
