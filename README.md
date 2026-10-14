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

## The web app (web-first beta, from 12 October 2026)

Decision: go web-first. A Next.js web app on Supabase, installable to the phone home screen, with sign-up and a usage dashboard. A native app comes later only if the beta shows notifications are what's missing. See `docs/ROADMAP.md`.

```
npm install
cp .env.example .env.local      # optional: without Supabase it runs on the newest data/edition-*.json
npm run dev                     # http://localhost:3000
npm test                        # unit tests, including the database on an in-memory Postgres
npm run build && npm start      # production build
BASE=http://localhost:3000 NODE_PATH=$(npm root -g) node e2e/reader.mjs   # phone + laptop checks (Playwright)
```

| Route | What it is |
|---|---|
| `/` | Today's edition: swipe deck, scroll mode, receipts, roundup audio, saved list, settings, tour, feedback |
| `/signin` | Email link or Google. The same flow signs up and signs in |
| `/admin` | Beta dashboard (admins only): return rates, daily readers, swipes, roundup plays, feedback, per-story and per-person tables |
| `/privacy` | Plain-English privacy note |
| `/opengraph-image` | The share image: date, issue number, top story, story count |

How it fits together:
- **Edition**: the morning job's JSON → `Load edition` GitHub Action → `dr_load_edition()` in Postgres. The database computes every grade; the app only displays them.
- **Readers**: state lives in the browser for everyone, and in their account when signed in (`src/lib/reader/sync.ts`).
- **Usage**: `events` table (random id per browser, plus account when signed in). Read only through the admin reports (`dr_admin_*` functions).
- **Admins**: an email in `admin_invites` (set in the database, never in the repo) becomes an admin on sign-up.

## Where things stand (7 October 2026)

- The prototype is live at https://claude.ai/artifact/F8Kh3wkf28tN2uarLx2L8q and gets a new edition every morning at 05:49 UK time from a scheduled Claude task.
- The top 5 stories each morning are recorded in Jonathan's cloned ElevenLabs voice by a GitHub Actions job in `BobbyBunson22/daily-receipts-voice`.
- Everything a reader does (likes, saves, puzzle progress, topics) is stored only in their own browser. There are no accounts, no notifications and no analytics yet. Fixing that is the first job of the real app.
