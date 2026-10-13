# Working on Daily Receipts

Read `docs/BRIEF.md` and `docs/ROADMAP.md` before starting a phase. The prototype in `prototype/index.html` is the reference for behaviour and look: when in doubt about how something should work, open it and match it.

## The product's one non-negotiable
Trust is the product. Never ship anything that could show a fact, grade or source the edition data doesn't contain. Never invent sample news in UI copy, tests or seed data: use `data/edition-2026-10-07.json`, which is real and sourced. Grades are computed from the edition data with the formula in `docs/ARCHITECTURE.md` (Grading), never hand-set in the client.

## Stack (see docs/ARCHITECTURE.md for why)
- App: Next.js (App Router) and TypeScript, web-first and installable to the home screen (decided 12 October 2026). Keep shared logic in `src/lib` free of React and Next so a native app can reuse it later.
- Backend: Supabase (Postgres, auth, storage, edge functions, scheduled jobs).
- Edition writing: the Anthropic API, server-side only.
- Voice: ElevenLabs, server-side only.
- Analytics: our own `events` table and admin reports for the beta (PostHog later if needed). Push: not in the web beta.

## Conventions
- TypeScript strict. Shared types for Edition, Story, Source and Grade live in one place and match `data/edition-*.json`.
- British English in all user-facing copy. The app's tone is casual; the news itself is sober and neutral.
- Secrets (Anthropic, ElevenLabs, Supabase service role) only in server environments. Never in the app bundle, never in the repo.
- Accessibility is a requirement, not a polish step: every control has a label, swipe actions have button equivalents, text scales, reduced motion is respected.
- Design: deep navy frame (#0d1836), white receipt slips with a torn bottom edge, Bricolage Grotesque for display, Newsreader for body, IBM Plex Mono for labels and numbers. The torn-slip "DR" logo is in the prototype as inline SVG.

## How to work
- Work phase by phase from docs/ROADMAP.md. Each phase has a definition of done; check it before calling the phase finished.
- Keep the prototype running untouched until the new app has replaced it for testers. It is still publishing a daily edition.
- Write tests for: grade calculation, deck ordering and personalisation, saved-list persistence, puzzle generators (sudoku must always have exactly one solution), and edition JSON validation.
- Ask Jonathan before: changing the grading formula, changing editorial rules, anything that costs money monthly, or anything that touches the live prototype or the voice repo.
