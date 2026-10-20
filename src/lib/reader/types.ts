/**
 * The edition as the web app uses it: one published edition with its stories,
 * sources resolved to outlet names, and the grade the database computed.
 */
import type { CutClaim, Figure, GradeLetter, KeptFact, Meters, Section } from '../../types/edition';

export interface ClientSource {
  key: string;
  name: string;
  country: string;
  url: string;
  note?: string | null;
}

export interface ClientAlso {
  key: string;
  name: string;
  url: string;
}

export interface ClientStory {
  /** Database id (stable across re-runs of the same edition). */
  id: number;
  slug: string;
  sec: string;
  sub: string;
  head: string;
  stand: string;
  body: string[];
  kept: KeptFact[];
  cut: CutClaim[];
  open: string[];
  primary: string[];
  m: Meters;
  src: ClientSource[];
  /** Other outlets' coverage, for further reading. Not sources and not graded. */
  also?: ClientAlso[];
  /** What the story is about, for learning from swipes. */
  tags?: string[];
  fig?: Figure | null;
  say?: string | null;
  sources: number;
  score: number;
  grade: GradeLetter;
  importance: number;
  /** Recorded clip in the presenter's AI voice, when there is one. */
  clip?: string | null;
}

export interface ClientEdition {
  /** Database id; null only for the local development copy. */
  id: number | null;
  issue: number;
  /** "Monday, 12 October 2026" */
  date: string;
  compiled: string;
  sections: Section[];
  stories: ClientStory[];
  outletCount: number;
  /** Fixed bulletin clips (intro, first, next, finally, outro), when recorded. */
  voice?: { name: string; parts: Record<string, string> } | null;
}

/** A saved story keeps a full copy, so it stays readable after the edition changes. */
export interface SavedEntry {
  id: number;
  issue: number;
  date: string;
  at: number;
  s: ClientStory & { secName: string };
}

export type SwipeAction = 'more' | 'less' | 'later';
export type Mode = 'swipe' | 'scroll';

export interface ReaderState {
  v: 1;
  /** The edition the per-day fields (react, swiped) belong to. */
  issue: number;
  order: string[];
  min: GradeLetter;
  mode: Mode;
  taste: { sec: Record<string, number>; sub: Record<string, number>; tag: Record<string, number> };
  /** Story id → 1 (more) or -1 (less), for the current edition. */
  react: Record<string, 1 | -1>;
  /** Story ids swiped in the current edition, in order. */
  swiped: number[];
  saves: SavedEntry[];
  /** Version of the welcome tour this reader has seen; 0 = never. */
  toured: number;
  /** Day streak: last London day opened and how many in a row. */
  streak: { last: string; n: number };
}
