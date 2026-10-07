# Daily Receipts

**Today's news, with receipts.** A daily news app for people with little time. Every story is rebuilt from several outlets, cut down to the facts the sources support, and graded A to D on how well those facts are backed up. Opinion, spin and loaded words are cut, and the app shows what was cut and why.

This repository starts the move from a working prototype (a single HTML page, live since 5 October 2026) to a real app.

## Start here

| File | What it is |
|---|---|
| `CLAUDE.md` | Instructions for Claude Code: conventions, guardrails, how to work in this repo |
| `docs/BRIEF.md` | The product: who it's for, what makes it different, every feature in the prototype and why |
| `docs/ARCHITECTURE.md` | Recommended stack and data model for the full app |
| `docs/ROADMAP.md` | The build plan in phases, each with a definition of done |
| `docs/PIPELINE.md` | How each morning's edition and voice clips are made today, and how that moves server-side |
| `docs/edition-prompt.md` | The editorial standard: the exact instructions the daily edition is written to |
| `prototype/index.html` | The working prototype. Open it in a browser. It is the reference for look, feel and behaviour |
| `data/edition-2026-10-07.json` | A real edition (issue 3, 51 stories, 102 outlets) in clean JSON, for seeding and tests |
| `voice/` | The current ElevenLabs recording job (runs in the separate `daily-receipts-voice` repo) |

## Where things stand (7 October 2026)

- The prototype is live at https://claude.ai/artifact/F8Kh3wkf28tN2uarLx2L8q and gets a new edition every morning at 05:49 UK time from a scheduled Claude task.
- The top 5 stories each morning are recorded in Jonathan's cloned ElevenLabs voice by a GitHub Actions job in `BobbyBunson22/daily-receipts-voice`.
- Everything a reader does (likes, saves, puzzle progress, topics) is stored only in their own browser. There are no accounts, no notifications and no analytics yet. Fixing that is the first job of the real app.
