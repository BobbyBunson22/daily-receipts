/**
 * Grading, as in docs/ARCHITECTURE.md (Grading) and the prototype's gradeStory().
 * Do not change this formula without asking Jonathan. The database computes the
 * same thing in supabase/migrations (dr_story_grade); tests check they agree.
 */
import type { GradeBand, GradeLetter, Meters } from '../types/edition';

export const GRADE_ORDER: readonly GradeLetter[] = ['A', 'B', 'C', 'D'];

export const GRADE_LABELS: Record<GradeLetter, GradeBand> = {
  A: {
    label: 'Firm',
    note: 'Core facts agree across several independent outlets and are backed by primary records.',
  },
  B: {
    label: 'Solid',
    note: 'Core facts are well supported, but the report rests on fewer outlets or some details still differ.',
  },
  C: {
    label: 'Developing',
    note: 'Supported by a narrow set of sources, or key details are still in dispute.',
  },
  D: {
    label: 'Unconfirmed',
    note: 'Main claims come from one side or an interested party and have not been independently checked.',
  },
};

/** Source spread from the number of sources: 1 → 25, 2 → 50, 3 → 70, 4+ → 85. */
export function spreadFor(sources: number): number {
  if (sources >= 4) return 85;
  if (sources === 3) return 70;
  if (sources === 2) return 50;
  return 25;
}

export function scoreFor(meters: Meters, sources: number): number {
  const [corroboration, primaryRecords, stability] = meters;
  return Math.round(
    corroboration * 0.3 + primaryRecords * 0.35 + spreadFor(sources) * 0.15 + stability * 0.2,
  );
}

export function gradeFor(score: number): GradeLetter {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  return 'D';
}

/** Used for "top stories" and for choosing which stories get voiced. */
export function importanceFor(sources: number, score: number): number {
  return sources * 10 + score / 10;
}

export interface StoryGrade {
  sources: number;
  spread: number;
  score: number;
  grade: GradeLetter;
  importance: number;
}

export function gradeStory(story: { m: Meters; src: readonly unknown[] }): StoryGrade {
  const sources = story.src.length;
  const score = scoreFor(story.m, sources);
  return {
    sources,
    spread: spreadFor(sources),
    score,
    grade: gradeFor(score),
    importance: importanceFor(sources, score),
  };
}
