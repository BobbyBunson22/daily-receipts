/**
 * Shared types for an edition. These mirror `data/edition-*.json` exactly;
 * the edition job writes this shape and the seed script reads it.
 */

export type GradeLetter = 'A' | 'B' | 'C' | 'D';

export type SectionId = string;

export interface EditionMeta {
  issue: number;
  /** Display date, e.g. "Wednesday, 7 October 2026". */
  date: string;
  /** Display compile time, e.g. "06:00 BST, 7 Oct 2026". */
  compiled: string;
}

export interface Section {
  id: SectionId;
  name: string;
  subs: string[];
}

export interface Outlet {
  name: string;
  country: string;
}

/** [outlet key, url] or [outlet key, url, note], e.g. "headline only". */
export type Source = [outletKey: string, url: string] | [outletKey: string, url: string, note: string];

/** Another outlet's article on the same story: [outlet key, url]. */
export type AlsoLink = [outletKey: string, url: string];

/** A fact kept in the story, with how well it is supported, e.g. "3 of 3 outlets". */
export type KeptFact = [fact: string, support: string];

/** A claim cut from the story, with the reason it was cut. */
export type CutClaim = [claim: string, reason: string];

/** Meters set by the edition job: corroboration, primary records, stability (0-100 each). */
export type Meters = [corroboration: number, primaryRecords: number, stability: number];

/** A headline figure: [value, caption], e.g. ["25", "boats seized"]. */
export type Figure = [value: string, caption: string];

export interface Story {
  id: string;
  sec: SectionId;
  sub: string;
  head: string;
  stand: string;
  body: string[];
  kept: KeptFact[];
  cut: CutClaim[];
  open: string[];
  primary: string[];
  m: Meters;
  src: Source[];
  /**
   * Other outlets' coverage of the same story, linked for further reading: [outlet key, url].
   * Not sources: nothing in the story is taken from them and they don't count towards the grade.
   */
  also?: AlsoLink[];
  /** Spoken line for the audio bulletin; only on voiced stories. */
  say?: string | null;
  fig?: Figure | null;
}

export interface GradeBand {
  label: string;
  note: string;
}

export interface GradingConfig {
  weights: { corroboration: number; primaryRecords: number; sourceSpread: number; stability: number };
  spread: Record<'1' | '2' | '3' | '4+', number>;
  bands: Record<GradeLetter, number>;
  labels: Record<GradeLetter, GradeBand>;
}

export interface ComputedGrade {
  id: string;
  score: number;
  grade: GradeLetter;
}

export interface Edition {
  edition: EditionMeta;
  sections: Section[];
  outlets: Record<string, Outlet>;
  stories: Story[];
  grading: GradingConfig;
  computed: ComputedGrade[];
}
