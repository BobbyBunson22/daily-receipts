/**
 * Story tags: the people, organisations, places and topics a story is about, so a swipe can
 * teach the feed about those rather than the whole section. The morning edition writes them
 * (`tags`); for editions without them, names are drawn from the headline and kept facts.
 * Framework-free.
 */

export const MAX_TAGS = 8;

/** The key a tag is learned under: lower case, no accents or punctuation. */
export const tagKey = (t: string) =>
  t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Capitalised words that start sentences or are too general to say what a story is about.
const NOT_NAMES = new Set(`a an the and but or if as at by for from in into of on to with after before over under
this that these those it its he she they we you his her their our new old more most first last
monday tuesday wednesday thursday friday saturday sunday january february march april may june july
august september october november december bst gmt am pm says said police court government minister
ministers president prime state states city council party league cup club bank ministry office house
north south east west northern southern eastern western central national international world global
report reports study studies people group company firm officials sources outlets outlet crown
senator mp mps msp msps
`.split(/\s+/));
const NOT_ACRONYMS = new Set(['bst', 'gmt', 'am', 'pm', 'tv', 'ok', 'ceo', 'id']);

/**
 * Name phrases in a piece of text: runs of capitalised words, and acronyms like NHS or EU.
 * `common` holds words seen in lower case elsewhere: a capitalised one of those at the start of
 * a sentence ("Hundreds", "Victim") is an ordinary word, not part of a name.
 */
export function names(text: string, common: Set<string> = new Set()): string[] {
  const out: string[] = [];
  const words = text.split(/\s+/);
  let run: string[] = [];
  let runStart = false;
  const flush = () => {
    if (runStart && run.length && common.has(run[0].toLowerCase())) run.shift();
    while (run.length && NOT_NAMES.has(run[0].toLowerCase())) run.shift();
    while (run.length && NOT_NAMES.has(run[run.length - 1].toLowerCase())) run.pop();
    if (run.length) out.push(run.join(' '));
    run = [];
    runStart = false;
  };
  words.forEach((raw, i) => {
    const w = raw.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '').replace(/[’']s$/, '');
    const startsSentence = i === 0 || /[.!?:;]["”’]?$/.test(words[i - 1] ?? '');
    const acronym = /^[A-Z]{2,5}$/.test(w) && !NOT_ACRONYMS.has(w.toLowerCase());
    const cap = /^\p{Lu}[\p{Ll}\p{Lu}'’-]+$/u.test(w) && !/^[A-Z]{2,}$/.test(w);
    const joiner = run.length > 0 && /^(of|de|da|la|le|von|van|al|bin)$/.test(w);
    if (acronym) {
      flush();
      out.push(w);
    } else if (cap || joiner) {
      if (!run.length) runStart = startsSentence;
      run.push(w);
    } else flush();
    if (/[,.;:!?)"”]$/.test(raw) || /[’']s$/.test(raw)) flush();
  });
  flush();
  return out;
}

interface Taggable { head: string; kept: [string, string][]; tags?: string[] | null }

/**
 * Tags for every story in an edition. A story's own `tags` win; otherwise names that appear
 * mid-sentence anywhere in the edition, found in this story's headline or facts. A two-word
 * person-style name also tags its surname, so "Donald Trump" and "Trump" meet.
 */
export function deriveTags<T extends Taggable>(stories: T[]): string[][] {
  const vocab = new Map<string, string>();
  const common = new Set<string>();
  for (const s of stories)
    for (const t of [s.head, ...s.kept.map((k) => k[0])])
      for (const w of t.split(/[^\p{L}]+/u)) if (w && w === w.toLowerCase()) common.add(w);
  for (const s of stories)
    for (const t of [s.head, ...s.kept.map((k) => k[0])])
      for (const n of names(t, common)) {
        const k = tagKey(n);
        if (k.length >= 2 && !NOT_NAMES.has(k) && !vocab.has(k)) vocab.set(k, n);
      }
  return stories.map((s) => {
    if (s.tags?.length) return s.tags.slice(0, MAX_TAGS);
    const text = ` ${tagKey([s.head, ...s.kept.slice(0, 4).map((k) => k[0])].join(' '))} `;
    const found: string[] = [];
    for (const [k, n] of vocab) if (text.includes(` ${k} `)) found.push(n);
    // prefer longer, more specific names; drop ones contained in a longer name already kept
    found.sort((a, b) => b.length - a.length);
    const kept: string[] = [];
    for (const n of found) if (!kept.some((m) => ` ${tagKey(m)} `.includes(` ${tagKey(n)} `))) kept.push(n);
    for (const n of kept.slice()) {
      const parts = n.split(' ');
      if (parts.length === 2 && /^\p{Lu}\p{Ll}+$/u.test(parts[1]) && !NOT_NAMES.has(parts[1].toLowerCase())) kept.push(parts[1]);
    }
    return [...new Set(kept)].slice(0, MAX_TAGS);
  });
}
