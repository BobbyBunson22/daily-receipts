-- New readers hear both newsreaders taking turns. Accounts still on the old default (George)
-- that never picked a voice move to it too.
alter table public.profiles alter column voice set default 'both';
update public.profiles p set voice = 'both'
where voice = 'george'
  and not exists (select 1 from public.events e where e.user_id = p.user_id and e.name = 'voice_pick');
