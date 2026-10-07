# Roadmap

Each phase ends with something testers can use. Don't start a phase until the previous one meets its definition of done.

## Phase 0: Decide and set up (half a day)
- Confirm the stack (Expo vs installable web app) with Jonathan.
- Create the Expo project, linting, TypeScript strict, test runner, CI on GitHub Actions.
- Create the Supabase project (EU region) and the schema from ARCHITECTURE.md with row-level security.
- Load `data/edition-2026-10-07.json` as seed data.
**Done when:** the app starts on a phone, reads the seeded edition from Supabase and lists its headlines; CI runs on every push.

## Phase 1: The reading experience (port the prototype)
- Shared types and a validator for editions; grade and importance computed server-side, matching the prototype.
- Swipe deck with three-way swipe, buttons, undo, "start over", fit-to-card headlines.
- Scroll mode, story sheet with full receipts, mic badge.
- Settings: topic chips, hold-and-drag order, minimum grade, forget my swipes.
- Brand: fonts, navy frame, receipt slips, torn-slip logo, app icon and splash.
**Done when:** a tester can't find a behaviour in the prototype that the app lacks, on a small and a large phone, with screen reader labels on every control.

## Phase 2: Accounts, sync and the daily loop
- Sign in with email link, Apple and Google; an anonymous mode that upgrades to an account without losing data.
- Reactions, saves (with snapshots), swipes, taste and topic order stored in Supabase and synced across devices.
- Roundup with the audio bulletin: recorded clips from storage, device voice fallback, a broken-clip fallback.
- Push notification at a chosen time: "Your receipts are ready".
- PostHog events: app open, card swiped (action), deck finished, story opened, roundup played (and finished), save, puzzle started/finished, notification opened.
**Done when:** the same account on two devices shows the same saves and roundup, a notification arrives at the chosen time, and the analytics dashboard shows next-day return.

## Phase 3: Move the edition and voice server-side
- Port the scheduled Claude task to an edition job calling the Anthropic API, using `docs/edition-prompt.md`; validate output; store; publish.
- Port the voice job to an edge function writing to Supabase storage; keep the chosen voice settings and fixed intro/sign-off.
- Run both in parallel with the prototype's pipeline for a week and compare.
- Admin page: today's edition, a "spot-check" queue of 5 random stories, a button to log a correction.
**Done when:** a week of editions has been produced by the new job with no manual fixes, and the prototype pipeline can be switched off.

## Phase 4: Puzzles, onboarding and beta
- Port the crossword and sudoku (seeded generators, five adaptive levels, progress synced to the account).
- Welcome tour.
- Public corrections log and a "How grades work" page.
- TestFlight and Play internal testing for 20-50 testers; feedback form in-app.
**Done when:** testers have used it daily for two weeks and the success numbers in BRIEF.md are being measured.

## Later, depending on what testers do
- Midday refresh for the top stories.
- More voiced stories (ElevenLabs Creator), or "record on first like" so every liked story is in Jonathan's voice.
- Shareable receipt card image for a single story.
- A crossword built from the day's news.
- Subscriptions (the £39/year question), once there is evidence people would pay.
