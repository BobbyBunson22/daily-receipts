# How an edition is made today

## 1. The edition (05:49 UK time)
A scheduled Claude task ("Daily Receipts edition") runs every morning. It:
1. Reads the live prototype page and keeps everything except the edition data.
2. Reads invited testers' taste scores from the page's shared database and gives sections they like 2 extra stories.
3. Finds the last 24-36 hours of news, opening at least one article per story and a second or third outlet where possible.
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
