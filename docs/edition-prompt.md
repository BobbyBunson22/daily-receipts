# Editorial standard for each edition

These are the rules the daily edition is written to today (from the scheduled task's instructions). The real app's edition job should use them as its prompt and its validator. Changing them changes what readers are told is true, so ask Jonathan first.

## Coverage
- At least 4 stories in each of the 10 sections (world, uk, politics, business, science, health, climate, tech, culture, sport); 6 or more for World, UK, Politics and Business when coverage allows. Never fewer than 3 in a section.
- Sections that readers' taste scores favour overall get 2 extra stories; sections clearly disliked may drop to the minimum.
- Prefer the last 24 to 36 hours, and the stories people are most likely to want to know about today.

## Sourcing
- For every story, open at least one article page and, wherever possible, a second or third independent outlet. Take facts only from pages actually opened.
- A search-result title alone may be listed only with the note "headline only".
- Never get round a site that refuses access by another route, a cache or a mirror.

## Writing each story
The app shows the headline, the standfirst and the first three kept facts, so those carry the story on their own.
- `head`: short and plain, ideally under 80 characters, sentence case.
- `stand`: one sentence, under 30 words.
- `kept`: the three most important verified facts first. Each is a short, complete statement a reader understands without the body (for example "Run-off on 25 October between Bolsonaro and Lula", not "Run-off date"), under 90 characters, with its support count ("2 of 3 outlets"). At least 3 per story.
- `say`: what the audio roundup reads aloud. One or two flowing sentences, 120 to 180 characters (190 at most), written for a presenter to speak. Go straight into the story and its key facts; never repeat the headline; never mention the section, grade, sources or outlet counts. Days of the week ("on Tuesday"), not "today". Numbers as a presenter would say them.
- `body`: 2 to 4 short paragraphs, sentences under 25 words, plain British English.
- `cut`: real claims or framings found in the coverage that were removed, each with the reason (opinion, single source, loaded language, speculation, private individual…). Empty when nothing needed removing. Never invented.
- `open`: details outlets disagree on, left out of the body (for example "Exact date: reports give 30 September or 1 October").
- `primary`: named officials, documents, data or records cited.
- `m`: [corroboration, primary records, stability], each 0 to 100. Corroboration 60-70 for one outlet citing official data, 80+ for 2+ outlets agreeing, under 50 when the main claims come from one side. Primary records high when official statements, data, court or police records are cited. Stability high for settled results, low for fast-moving or disputed events. Be strict: one-outlet stories should rarely reach A.
- `src`: [outletKey, url, optional note]. Every outlet key must exist in the outlets list.
- `fig`: optional, at most 6 stories a day with one clear headline number.

## Always
- Write every sentence in your own words. Quotes only for short claims in the cut list, under 10 words.
- Keep only facts the sources support. Attribute claims ("police said", "the company says"). Leave out opinion, prediction and loaded words. The app's tone is casual; the reports are sober and neutral.
- Do not name private individuals who are not public figures (for example victims or junior staff). Charged suspects only when police or courts have named them, with charges described as allegations.

## Checks before publishing
- Every figure, name and date in the stories and `say` lines matches a page that was opened.
- Ids unique; every section and sub-section exists; every source key exists in outlets; 3+ kept facts and a `say` line on every story.
- Edition: issue = yesterday's + 1, date "Weekday, D Month YYYY".

## Story shape
```
{id, sec, sub, head, say, stand, body:[…], kept:[[fact, support]], cut:[[claim, reason]],
 open:[…], primary:[…], m:[corroboration, primaryRecords, stability],
 src:[[outletKey, url, note?]], fig?:[value, label]}
```
See `data/edition-2026-10-07.json` for a full real example.
