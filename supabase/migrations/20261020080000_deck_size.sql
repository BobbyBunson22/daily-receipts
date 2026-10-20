-- "Number of receipts": how many stories a reader's daily deck holds (Quick 18, Standard 36, Long 54).
alter table public.profiles add column if not exists deck_size text not null default 'standard'
  constraint profiles_deck_size_check check (deck_size in ('quick', 'standard', 'long'));
