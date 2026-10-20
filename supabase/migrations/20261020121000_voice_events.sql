-- Record newsreader choices and samples.
alter table public.events drop constraint events_name_check;
alter table public.events add constraint events_name_check check (name in (
  'open', 'swipe', 'deck_done', 'restart', 'story_open', 'source_click',
  'roundup_open', 'roundup_play', 'roundup_done', 'save', 'unsave',
  'mode', 'settings', 'signup_start', 'signin', 'signout', 'feedback',
  'install', 'share', 'puzzle_start', 'puzzle_done', 'voice_pick', 'voice_sample'));
