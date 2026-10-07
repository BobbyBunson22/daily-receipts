# Architecture

## Recommended stack

| Layer | Choice | Why |
|---|---|---|
| App | **Expo (React Native) + Expo Router + TypeScript** | One codebase for iOS, Android and web. Native push notifications and TestFlight for the beta, which a web page can't do well (iPhone web push only works after "Add to Home Screen"). |
| Gestures and animation | react-native-gesture-handler + Reanimated | Smooth three-way swipe deck and hold-to-drag reordering. |
| Backend | **Supabase** | Postgres, sign-in (email magic link, Apple, Google), file storage for audio, edge functions for server-side API calls, scheduled jobs. One service, generous free tier. |
| Edition writing | **Anthropic API** (Claude, with web search) in a scheduled server job | Moves the current scheduled Claude task into the product. Writes straight to the database. |
| Voice | **ElevenLabs** from an edge function | Key stays server-side. Opens the door to "record on first like" later. |
| Analytics | **PostHog** | Return rates, funnels, feature use; EU hosting available. |
| Push | **Expo notifications** | "Your receipts are ready" at a time each reader picks. |
| Web | Expo web build on Vercel or Netlify | Keeps a shareable link for people who won't install an app. |

Alternative if a faster first step is wanted: a Next.js installable web app (PWA) on the same Supabase backend. It ships sooner but notifications on iPhone are weaker. Decide before Phase 1.

## Data model (Postgres)

```
editions      id, issue (unique), date, compiled_at, status (draft|published), created_at
sections      id ('world','uk',…), name, subs text[], sort
outlets       key, name, country
stories       id, edition_id, slug, sec, sub, head, say, stand, body text[],
              kept jsonb [[fact, support]], cut jsonb [[claim, reason]], open text[],
              primary_sources text[], m_corroboration, m_primary, m_stability,
              fig jsonb null, importance (computed), grade (computed), score (computed)
story_sources story_id, outlet_key, url, note
voice_clips   story_id, voice_id, settings_hash, path, chars, created_at
profiles      user_id, display_name, topic_order text[], min_grade, puzzles_on jsonb,
              notify_at time, created_at
taste         user_id, key ('sec:world' | 'sub:world/Europe'), score (-10..10)
reactions     user_id, story_id, value (-1|1), created_at
saves         user_id, story_id, snapshot jsonb, created_at      -- snapshot keeps it readable forever
swipes        user_id, edition_id, story_id, action (more|less|later), created_at
puzzle_state  user_id, game ('cw'|'su'), date, level, state jsonb, done, secs, hints, checks
puzzle_level  user_id, game, level
feedback      user_id, edition_id, useful, trust, mode, pay, wish, created_at
corrections   id, story_id, what_changed, created_at                -- public log
```
Row-level security: readers see published editions and their own rows only. Only server jobs write editions, stories and clips.

## Grading (must match the prototype exactly)
- Source spread from the number of sources: 1 → 25, 2 → 50, 3 → 70, 4+ → 85.
- score = round(0.30 × corroboration + 0.35 × primary records + 0.15 × spread + 0.20 × stability)
- A ≥ 85, B ≥ 70, C ≥ 55, else D. Labels: Firm, Solid, Developing, Unconfirmed.
- importance = sources × 10 + score / 10 (used for "top stories" and which stories get voiced).

## Personalisation (port from prototype)
- forYou(story) = importance + 6 × affinity + 0.8 × (10 − rank of its section in the reader's order)
- affinity = taste[sec] + 0.5 × taste[sec/sub]; a like adds 1, a skip subtracts 1, clamped to −10..10.
- Saving for later is neutral: no taste change.

## Server jobs
1. **Edition job** (05:30 UK): gather, write and check the edition with Claude using `docs/edition-prompt.md`; validate against the schema; save as draft; publish. Optional human approval step later.
2. **Voice job** (after publish): record the top N `say` lines plus any fixed phrases not yet recorded; store in Supabase storage; write `voice_clips`.
3. **Notify job**: push "Your receipts are ready" at each reader's chosen time.
4. **Midday refresh** (later): update the top stories if they have moved on.
