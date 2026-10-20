-- Readers can choose both newsreaders, taking turns story by story.
alter table public.profiles drop constraint if exists profiles_voice_check;
alter table public.profiles add constraint profiles_voice_check check (voice in ('george', 'emma', 'both'));
