# Roadmap

Web-first (decided 12 October 2026). The question for the beta is whether people come back every morning; a web app answers it at almost no cost. Each phase ends with something testers can use. Don't start a phase until the previous one meets its definition of done.

## Phase 0: Set up ✅ (7 to 12 October)
- Next.js + TypeScript strict, Vitest, ESLint, CI on GitHub Actions.
- Supabase schema with row-level security; grading computed in the database and tested against the TypeScript formula.
- Shared types, edition validator, `prepareEdition` clean-ups.

## Phase 1: The reading experience on the web ✅ (12 October)
- Swipe deck (drag, buttons, arrow keys, undo, start over, fit-to-card headlines), scroll mode, receipts sheet, roundup bulletin with device voice and recorded clips, saved list with full snapshots, topics with hold-and-drag, minimum grade, forget my swipes, welcome tour.
- Brand: fonts, navy frame, receipt slips, torn-slip logo, app icons, home-screen manifest, dated share image.
- Checked at 360×640, 390×844 and 1280×800 (`e2e/reader.mjs`).

## Phase 2: Accounts, feedback and the dashboard (built 12 October; live once deployed)
- Sign up / sign in by email link or Google; reading needs no account. Signing in merges this browser's likes, saves and topics into the account and keeps them in step.
- Usage events and the `/admin` dashboard: next-day and 7-day return, daily readers, sign-ups, deck completion, swipes and likes per visit, roundup plays, sections, per-story and per-person tables.
- Feedback form open to everyone, one answer per reader per edition.
**Done when:** deployed on the domain; Jonathan signs in and sees the dashboard; a tester signs up on two devices and sees the same saves; the morning edition appears in the web app without anyone touching it.

### To finish Phase 2
1. Apply `supabase/migrations/20261012110000_web_beta.sql` and add Jonathan's email to `admin_invites`.
2. Supabase Auth: site URL and redirect URLs for the domain; Google provider; custom SMTP so sign-in emails reach people (Supabase's built-in sender is for testing only).
3. Vercel: import the repo, set the three `NEXT_PUBLIC_*` variables, attach the domain.
4. GitHub secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the `Load edition` workflow.
5. Morning task: also push `data/edition-YYYY-MM-DD.json` to this repo (needs Jonathan's go-ahead: it changes the live pipeline).
6. Voice clips: copy each morning's clips into Supabase storage (`voice` bucket) and `voice_clips` (needs Jonathan's go-ahead: touches the voice repo).

## Phase 3: Beta with 20 to 50 testers (two weeks)
- Daily "your receipts are ready" email at a time each reader picks (email reaches every phone; web push only works on iPhone after Add to Home Screen).
- Puzzles ✅ (15 October): crossword, sudoku, Rulebook and Sure?, same daily puzzles as the prototype, adaptive levels, plays on the admin dashboard. Progress is per device for now; syncing it to the account is next.
- Daily-fresh puzzles ✅ (from No. 11, 16 October): the crossword gets 2 to 3 clues from the day's headlines and rotates a 750-word bank so no bank word appears on consecutive days; Sure? asks 2 numbers from the day's kept facts (backed by 2+ outlets, quoted word for word) plus 3 from a 121-question bank that doesn't repeat for 40 days; Rulebook draws from 29 rules, with today's examples taken from the headlines. The web app's puzzles now differ from the prototype's.
- Public corrections log and a "How grades work" page; daily spot-check of 5 random stories.
**Done when:** testers have used it for two weeks and BRIEF.md's success numbers are on the dashboard.

## Phase 4: Move the edition and voice server-side
- Port the scheduled Claude task to an edition job calling the Anthropic API with `docs/edition-prompt.md`; validate; store; publish. Run alongside the current task for a week and compare.
- Port the voice job to an edge function writing to Supabase storage.
**Done when:** a week of editions comes from the new job with no manual fixes, and the prototype pipeline can be switched off.

## Later, depending on what testers do
- Native app (Expo) if the beta shows notifications are what's missing; `src/lib` is framework-free so it carries over.
- Midday refresh for the top stories. More voiced stories. Shareable receipt card for a single story. Subscriptions (the £39/year question), once there is evidence people would pay.
