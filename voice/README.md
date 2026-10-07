# Daily Receipts voice

Records each morning's roundup clips in Jonathan's cloned ElevenLabs voice.

Plan: ElevenLabs Starter (30,000 credits a month). `max_stories` is 5. Each story is a short presenter-style line (`say`, about 180 characters: the story and its key facts, no grades), so a day costs about 900 characters, roughly 27,000 a month. The intro and sign-off are fixed phrases recorded once.

Voice settings were chosen by ear from the comparison job (`compare.py`, option 4).

1. Each morning the Daily Receipts edition job writes `scripts/edition.json` and pushes it.
2. That push runs **Record today's bulletin** (`.github/workflows/voice.yml`), which calls ElevenLabs
   and commits `audio/<issue>/*.mp3` and `audio/<issue>/manifest.json`.
3. The edition job pulls the clips and publishes them with the app, which plays them in the roundup.

Setup: add the `ELEVENLABS_API_KEY` secret (Settings > Secrets and variables > Actions).
`max_stories` in `voice.json` limits how many stories get voiced each day (most important first; 0 = all). Stories without a clip are read by the listener's device voice.
Voice settings are in `voice.json`.
