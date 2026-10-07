# Product brief

## The promise
**Today's news, with receipts.** Verified top stories, each reduced to a handful of key facts with the sources that back them, in a few minutes a day.

## Who it's for
People who want to know what happened without wading through opinion, clickbait or a 40-minute podcast. Younger, phone-first, "trigger happy" readers who flick through things, and anyone who has stopped trusting a single outlet.

## What makes it different
1. **Receipts, not summaries.** Each story lists the facts kept (with how many outlets support each), the claims cut and why ("opinion", "single source", "loaded language"), the details still in dispute, and every source checked.
2. **A grade on every story.** A to D, computed from corroboration, primary records, source spread and stability. Honest by design: single-outlet stories rarely reach A.
3. **A daily ritual.** One edition each morning. Swipe through the cards, build a roundup of what you liked, hear it read aloud in a human voice, and you're done.
4. **A person behind it.** The roundup is read in Jonathan's AI-cloned voice, labelled as such.

## Brand
- Name: Daily Receipts. Tagline: "Today's news, with receipts."
- Look: deep navy frame, white receipt slips with torn edges, a torn-slip "DR" logo with a tick. Fonts: Bricolage Grotesque (display), Newsreader (body), IBM Plex Mono (labels).
- Voice: casual and friendly in the app's own words; sober, neutral, attributed in the news.

## Features in the prototype (the reference implementation)
Each of these is working in `prototype/index.html`.

**Reading**
- **Swipe mode (default).** One receipt-style card per story: section, headline, standfirst, first three facts, grade, "x checked / y claims cut". Swipe right = more like this (adds to roundup), left = less like this, up = save for later (neutral, no effect on the feed). Buttons and arrow keys do the same; undo brings the last card back. Tap a card for the full receipts. Headlines must always show in full; the card shrinks type and trims facts rather than cut a headline.
- **Scroll mode.** The edition as a stack of receipt slips: top 8 "for you", then each topic in the reader's order, with "more in…" buttons.
- **Story sheet.** Verified facts, short body, what we cut and why, still unclear, grade box with the four meters, and the sources with links.
- **Mic badge.** Stories recorded in the presenter's voice today carry a "Jonathan's voice" badge.

**Personalisation**
- Likes and skips adjust section and sub-section scores (-10 to 10); the deck and scroll order blend importance, these scores and the reader's topic order.
- Settings: tap topics on or off as buttons; hold and drag to reorder (top three get the most stories); minimum grade filter; "forget my swipes".
- Start over at any time; every story stays available until the next edition.

**Roundup and audio**
- Liked stories form a roundup. "Play bulletin" reads it as a short news bulletin: a fixed intro, "First / Next / Finally", each story's spoken line (no headline repeated, no grades or source counts), and a fixed sign-off.
- Recorded clips are used where they exist (top 5 stories a day); the device voice reads the rest. A broken clip falls back to the device voice.

**Saved for later**
- Swipe up or tap the bookmark. Saved stories are archived with a full copy of their receipts, so they stay readable after the edition changes, grouped by day. Currently stored per device only.

**Daily puzzles**
- A crossword and a sudoku per edition, seeded from the edition date so everyone at the same level gets the same puzzle. Five levels each: finish with no hints and at most one check and tomorrow's goes up a level; reveal or use 3+ hints and it eases off. Check, hint/reveal, timer, notes (sudoku). Can be switched off in settings. Crossword clues come from a built-in bank of ~300; a news-based crossword is a future idea.

**Onboarding and feedback**
- A 7-step welcome tour (what it is, grades, swiping, roundup, saved, puzzles, make it yours), replayable from settings.
- Invited testers can leave feedback (useful 1-5, trust, preferred mode, would they pay £39/year, free text) and their taste scores sync so the morning edition can weight sections they like.

## Known weaknesses to fix in the real app
1. **No accounts or sync.** Saves, roundups, puzzle levels and taste live in one browser.
2. **No analytics.** We cannot see next-day or next-week return rates, deck completion or roundup plays.
3. **No notifications.** Nothing brings people back at 7am.
4. **Trust process.** The AI that writes a story also scores it. Needs a daily human spot-check, a public corrections log and a plain "how grades work" page.
5. **Sources.** The writer cannot read the BBC, Reuters, AP or the Guardian, so it leans on Al Jazeera, Euronews, ITV, CBS and ABC Australia. Proper source access and licensing need deciding before a public launch.
6. **One edition a day.** Stories go stale by the afternoon; a short midday update for the top stories is wanted.
7. **Voice coverage.** Only the top 5 stories are recorded on the ElevenLabs Starter plan, so many roundups mix two voices.

## What success looks like for the beta
20-50 people using it every morning for two weeks. Measure: next-day and 7-day return, share of the deck finished, roundup plays, likes per session, and answers to "would you pay £39 a year?".
