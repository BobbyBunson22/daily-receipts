-- The newsreader: a public bucket for recorded clips, and each reader's choice of voice.
-- Clips are listed in voice_clips (voice_id 'kokoro:bm_george' or 'kokoro:bf_emma').
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('voice', 'voice', true, 3145728, array['audio/mpeg'])
    on conflict (id) do nothing;
  end if;
end $$;
alter table public.profiles add column if not exists voice text not null default 'george' check (voice in ('george', 'emma'));
