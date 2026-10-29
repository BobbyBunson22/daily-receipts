/**
 * Focus receipts: one big story of the day (say, the Budget) boiled down to its headline facts,
 * as a pop-up. Nothing in a focus receipt is written by hand: every line is a kept fact from one
 * of the edition's own stories, word for word, with that story's support count and computed grade.
 * The only hand-chosen thing is which stories belong to the focus (FOCUSES, by edition issue).
 *
 * Free of React and Next, so a native app can reuse it.
 */
import type { GradeLetter } from '../../types/edition';
import type { ClientEdition, ClientStory } from '../reader/types';

export interface FocusDef {
  /** The edition this focus belongs to. It never shows on any other day. */
  issue: number;
  /** Short name of the subject, e.g. "UK Budget". */
  title: string;
  /** Story slugs (the edition's story ids), lead story first. */
  stories: string[];
}

/** Today's focus receipts. Add one per edition when a single story dominates the news. */
export const FOCUSES: FocusDef[] = [
  {
    issue: 21,
    title: 'UK Budget',
    stories: [
      'pol-budget-healey-delivered',
      'biz-obr-growth-bank-tax',
      'cl-uk-budget-energy-measures',
      'hl-budget-nhs-190m',
      'pol-wales-budget-450m',
      'uk-bakerloo-extension-powers',
    ],
  },
];

export interface FocusLine {
  fact: string;
  /** As in the story, e.g. "3 of 3 outlets". */
  support: string;
  story: ClientStory;
}

export interface Focus {
  key: string;
  title: string;
  lines: FocusLine[];
  /** The stories the lines come from, in focus order. */
  stories: ClientStory[];
  /** Distinct outlets behind those stories. */
  outlets: number;
  /** Lowest grade among the stories the lines come from (A best). */
  floor: GradeLetter;
}

const MAX_LINES = 8;
const LEAD_LINES = 3;
const OTHER_LINES = 2;
const MIN_LINES = 4;

/** Outlets backing a fact, from "2 of 3 outlets"; 0 if it can't be read. */
export function backers(support: string): number {
  const m = /^(\d+)\s+of\s+\d+/i.exec(support.trim());
  return m ? Number(m[1]) : 0;
}

const STOP = new Set(['the', 'and', 'for', 'from', 'with', 'this', 'that', 'its', 'are', 'was', 'has', 'have', 'will', 'into', 'than', 'until', 'over', 'about']);
const words = (s: string) =>
  new Set(s.toLowerCase().replace(/[^a-z0-9£%.\s-]/g, ' ').split(/\s+/).map((w) => w.replace(/^[.-]+|[.-]+$/g, '')).filter((w) => w.length > 2 && !STOP.has(w)));

/** True when two facts say much the same thing (most words of the shorter one are in the other). */
export function sameFact(a: string, b: string): boolean {
  const A = words(a), B = words(b);
  const small = A.size <= B.size ? A : B, big = small === A ? B : A;
  if (!small.size) return false;
  let shared = 0;
  for (const w of small) if (big.has(w)) shared++;
  return shared / small.size >= 0.4;
}

/**
 * Builds the focus receipt for this edition, or null when there isn't one (or too little of it
 * is well supported). Lines: facts backed by at least two outlets, in each story's own order,
 * up to 3 from the lead story and 2 from each of the others, no repeats, 8 at most.
 */
export function focusFor(ed: Pick<ClientEdition, 'issue' | 'stories'>, defs: FocusDef[] = FOCUSES): Focus | null {
  const def = defs.find((d) => d.issue === ed.issue);
  if (!def) return null;
  const bySlug = new Map(ed.stories.map((s) => [s.slug, s]));
  const stories = def.stories.map((slug) => bySlug.get(slug)).filter((s): s is ClientStory => !!s);
  const lines: FocusLine[] = [];
  stories.forEach((story, i) => {
    let taken = 0;
    for (const [fact, support] of story.kept) {
      if (lines.length >= MAX_LINES || taken >= (i === 0 ? LEAD_LINES : OTHER_LINES)) break;
      if (backers(support) < 2) continue;
      if (lines.some((l) => sameFact(l.fact, fact))) continue;
      lines.push({ fact, support, story });
      taken++;
    }
  });
  if (lines.length < MIN_LINES) return null;
  const used = [...new Set(lines.map((l) => l.story))];
  const floor = used.map((s) => s.grade).sort().pop() as GradeLetter;
  return {
    key: `${ed.issue}:${def.title}`,
    title: def.title,
    lines,
    stories: used,
    outlets: new Set(used.flatMap((s) => s.src.map((x) => x.key))).size,
    floor,
  };
}
