# How an edition is made today

## 0. The feed list (04:35 UK time, 03:35 in winter)
The GitHub Action "Fetch feeds" (`.github/workflows/fetch-feeds.yml`) reads the RSS and Atom feeds of the outlets in `data/feeds.json`: 40 outlets across the UK, US, Europe, the Middle East, Asia-Pacific, Africa, Latin America, Spanish-language outlets, science and tech, and official sources (GOV.UK, ONS, Bank of England, WHO, NASA). It keeps headlines and links from the last 36 hours, with no article text, groups headlines that look like the same story (`src/lib/feeds.ts`), and publishes `latest.json` on the `feeds` branch, with a health report in that branch's README. The edition task starts from it.

The groups are leads, not sources: facts still come only from article pages the edition task can open. Some outlets refuse the edition task's web reader (BBC, Guardian, Sky, Independent, DW); their headlines can only be listed as "headline only". Spanish-language outlets are read in Spanish and written up in English, with the source marked "translated from Spanish". To add or drop an outlet, edit `data/feeds.json`; the Action reports any feed that fails.

## 1. The edition (05:49 UK time)
A scheduled Claude task ("Daily Receipts edition") runs every morning. It:
1. Reads the live prototype page and keeps everything except the edition data.
2. Reads invited testers' taste scores from the page's shared database and gives sections they like 2 extra stories.
3. Reads the feed list, then finds the last 24-36 hours of news, preferring stories that several outlets from different regions cover, opening at least one article per story and a second or third outlet where possible.
4. Writes each story to the rules in `edition-prompt.md`: headline, standfirst, 3+ kept facts with support counts, a spoken `say` line, cut claims with reasons, open questions, sources, and the three scores (corroboration, primary records, stability).
5. Checks the data, publishes the page, then runs the voice step below, and messages Jonathan a summary.

Typical output: around 50 stories across 10 sections, about 100 outlets.

## 2. The voice (straight after)
Repository: `BobbyBunson22/daily-receipts-voice` (copy of the job in `voice/`).
1. The edition task runs `voiceScript()` in the page, which produces the day's spoken lines in importance order, and pushes them as `scripts/edition.json`.
2. That push starts the GitHub Actions job "Record today's bulletin" (`voice/workflows/voice.yml`). It calls ElevenLabs with the `ELEVENLABS_API_KEY` secret and records the top `max_stories` (5) lines plus any fixed phrases not yet recorded. File names carry a hash of the words and voice settings, so nothing is paid for twice.
3. It commits `audio/<issue>/*.mp3`, `audio/fixed/*.mp3`, a manifest, and `status.json` (ok or the exact error).
4. The edition task copies the clips and manifest onto the page.

Voice settings (chosen by ear): model `eleven_multilingual_v2`, stability 0.35, similarity 0.9, style 0.3, speaker boost on. Voice ID `s7RXgXaijQTIObr1saTG` (not secret). Fixed phrases:
- Intro: "Hello, and welcome to your Daily Receipts roundup. Here are the stories you picked."
- Joins: "First." / "Next." / "Finally."
- Sign-off: "And that's the news, with the receipts. Thanks for listening, and see you tomorrow."

Cost: about 850 characters a day, roughly 26,000 a month, on the ElevenLabs Starter plan (30,000 a month).

## Moving it into the real app
See ARCHITECTURE.md (Server jobs) and ROADMAP.md Phase 3. Keep `edition-prompt.md` as the single source of editorial rules, and validate every edition against the shared schema before it is published.
