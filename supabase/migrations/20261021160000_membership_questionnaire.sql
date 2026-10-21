-- The membership questionnaire: price ("about £2.50 a month or £25 a year") and wanted extras,
-- as well as usefulness and trust. The first completion wins 10 gold DR tokens, once ever.
alter table public.feedback add column if not exists price text check (price in ('annual', 'monthly', 'maybe', 'cheaper', 'free'));
alter table public.feedback add column if not exists extras text[] check (extras is null or (cardinality(extras) <= 8 and extras <@ array['roundup', 'audio', 'archive', 'alerts', 'puzzles', 'nosponsor', 'support']::text[]));

create or replace function public.dr_send_questionnaire(
  p_anon_id text, p_edition_id bigint, p_useful smallint, p_trust smallint, p_price text, p_extras text[], p_wish text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_pay text := case p_price when 'annual' then 'yes' when 'monthly' then 'yes' when 'free' then 'no' else 'maybe' end;
  v_awarded integer := 0;
begin
  if p_anon_id !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'bad anon id'; end if;
  if not exists (select 1 from public.editions where id = p_edition_id and status = 'published') then raise exception 'unknown edition'; end if;
  if p_price is null then raise exception 'price needed'; end if;
  if uid is not null then
    insert into public.feedback (user_id, anon_id, edition_id, useful, trust, pay, price, extras, wish)
    values (uid, p_anon_id, p_edition_id, p_useful, p_trust, v_pay, p_price, p_extras, nullif(btrim(p_wish), ''))
    on conflict (user_id, edition_id) where user_id is not null
    do update set useful = excluded.useful, trust = excluded.trust, pay = excluded.pay, price = excluded.price,
                  extras = excluded.extras, wish = excluded.wish, updated_at = now();
    insert into public.token_awards (user_id, reason, amount) values (uid, 'questionnaire', 10) on conflict do nothing;
    get diagnostics v_awarded = row_count;
  else
    insert into public.feedback (anon_id, edition_id, useful, trust, pay, price, extras, wish)
    values (p_anon_id, p_edition_id, p_useful, p_trust, v_pay, p_price, p_extras, nullif(btrim(p_wish), ''))
    on conflict (anon_id, edition_id) where user_id is null
    do update set useful = excluded.useful, trust = excluded.trust, pay = excluded.pay, price = excluded.price,
                  extras = excluded.extras, wish = excluded.wish, updated_at = now();
  end if;
  return jsonb_build_object('awarded', case when v_awarded > 0 then 10 else 0 end);
end;
$$;
revoke all on function public.dr_send_questionnaire(text, bigint, smallint, smallint, text, text[], text) from public;
grant execute on function public.dr_send_questionnaire(text, bigint, smallint, smallint, text, text[], text) to anon, authenticated;

-- Someone who answered before signing up gets their 10 tokens once they've signed in
-- (their answers move to the account when they sign in on that browser).
create or replace function public.dr_claim_questionnaire_award() returns integer
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := (select auth.uid()); n integer := 0;
begin
  if uid is null then return 0; end if;
  if exists (select 1 from public.feedback where user_id = uid and price is not null) then
    insert into public.token_awards (user_id, reason, amount) values (uid, 'questionnaire', 10) on conflict do nothing;
    get diagnostics n = row_count;
  end if;
  return case when n > 0 then 10 else 0 end;
end;
$$;
revoke all on function public.dr_claim_questionnaire_award() from public, anon;
grant execute on function public.dr_claim_questionnaire_award() to authenticated;

-- For the admin page: what readers would pay and what they'd want.
create or replace function public.dr_admin_membership() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins where user_id = (select auth.uid())) then raise exception 'admins only'; end if;
  return jsonb_build_object(
    'answers', (select count(*) from public.feedback where price is not null),
    'price', (select coalesce(jsonb_object_agg(price, n), '{}'::jsonb) from (select price, count(*) n from public.feedback where price is not null group by 1) x),
    'extras', (select coalesce(jsonb_object_agg(e, n), '{}'::jsonb) from (select unnest(extras) e, count(*) n from public.feedback where extras is not null group by 1) y)
  );
end;
$$;
revoke all on function public.dr_admin_membership() from public, anon;
grant execute on function public.dr_admin_membership() to authenticated;
