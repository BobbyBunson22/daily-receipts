/**
 * Checks that an edition is complete and internally consistent before it is
 * stored. Anything that fails here must never reach a reader.
 */
import type { Edition } from '../types/edition';
import { gradeStory } from './grading';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isTextArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isText);
const isPair = (v: unknown): v is [string, string] =>
  Array.isArray(v) && v.length === 2 && isText(v[0]) && isText(v[1]);
const isMeter = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100;

function isHttpsUrl(v: unknown): boolean {
  if (!isText(v)) return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateEdition(input: unknown): ValidationResult {
  const errors: string[] = [];
  const fail = (msg: string) => errors.push(msg);

  if (!isObject(input)) return { ok: false, errors: ['edition must be an object'] };

  const meta = input.edition;
  if (!isObject(meta)) fail('edition: missing');
  else {
    if (!(typeof meta.issue === 'number' && Number.isInteger(meta.issue) && meta.issue > 0))
      fail('edition.issue: must be a positive integer');
    if (!isText(meta.date)) fail('edition.date: missing');
    if (!isText(meta.compiled)) fail('edition.compiled: missing');
  }

  const sections = new Map<string, Set<string>>();
  if (!Array.isArray(input.sections) || input.sections.length === 0) fail('sections: missing');
  else
    input.sections.forEach((sec, i) => {
      if (!isObject(sec) || !isText(sec.id) || !isText(sec.name) || !isTextArray(sec.subs)) {
        fail(`sections[${i}]: needs id, name and subs`);
        return;
      }
      if (sections.has(sec.id)) fail(`sections[${i}]: duplicate id "${sec.id}"`);
      sections.set(sec.id, new Set(sec.subs));
    });

  const outlets = isObject(input.outlets) ? input.outlets : null;
  if (!outlets) fail('outlets: missing');
  else
    for (const [key, o] of Object.entries(outlets))
      if (!isObject(o) || !isText(o.name) || !isText(o.country))
        fail(`outlets.${key}: needs name and country`);

  const ids = new Set<string>();
  if (!Array.isArray(input.stories) || input.stories.length === 0) fail('stories: missing');
  else
    input.stories.forEach((s, i) => {
      if (!isObject(s)) {
        fail(`stories[${i}]: must be an object`);
        return;
      }
      const at = `stories[${i}]${isText(s.id) ? ` (${s.id})` : ''}`;
      if (!isText(s.id)) fail(`${at}: id missing`);
      else if (ids.has(s.id)) fail(`${at}: duplicate id`);
      else ids.add(s.id);

      const subs = isText(s.sec) ? sections.get(s.sec) : undefined;
      if (!subs) fail(`${at}: unknown section "${String(s.sec)}"`);
      else if (!isText(s.sub) || !subs.has(s.sub))
        fail(`${at}: sub "${String(s.sub)}" is not in section "${String(s.sec)}"`);

      for (const k of ['head', 'stand'] as const) if (!isText(s[k])) fail(`${at}: ${k} missing`);
      if (!isTextArray(s.body) || s.body.length === 0) fail(`${at}: body missing`);
      if (!Array.isArray(s.kept) || s.kept.length === 0 || !s.kept.every(isPair))
        fail(`${at}: kept must be a non-empty list of [fact, support]`);
      if (!Array.isArray(s.cut) || !s.cut.every(isPair))
        fail(`${at}: cut must be a list of [claim, reason]`);
      if (!isTextArray(s.open)) fail(`${at}: open must be a list of text`);
      if (!isTextArray(s.primary)) fail(`${at}: primary must be a list of text`);
      if (!Array.isArray(s.m) || s.m.length !== 3 || !s.m.every(isMeter))
        fail(`${at}: m must be three whole numbers from 0 to 100`);

      if (!Array.isArray(s.src) || s.src.length === 0) fail(`${at}: src must list at least one source`);
      else
        s.src.forEach((src, j) => {
          if (!Array.isArray(src) || src.length < 2 || src.length > 3) {
            fail(`${at}: src[${j}] must be [outlet, url] or [outlet, url, note]`);
            return;
          }
          if (!outlets || !isText(src[0]) || !(src[0] in outlets))
            fail(`${at}: src[${j}] outlet "${String(src[0])}" is not in outlets`);
          if (!isHttpsUrl(src[1])) fail(`${at}: src[${j}] url must be https`);
          if (src.length === 3 && !isText(src[2])) fail(`${at}: src[${j}] note must be text`);
        });

      if (s.say != null && !isText(s.say)) fail(`${at}: say must be text or absent`);
      if (s.fig != null && !isPair(s.fig)) fail(`${at}: fig must be [value, caption] or absent`);
    });

  // If the edition carries precomputed grades, they must agree with the formula.
  if (Array.isArray(input.computed) && errors.length === 0) {
    const stories = new Map((input as unknown as Edition).stories.map((s) => [s.id, s]));
    for (const c of input.computed as unknown[]) {
      if (!isObject(c) || !isText(c.id)) {
        fail('computed: each entry needs an id');
        continue;
      }
      const story = stories.get(c.id);
      if (!story) {
        fail(`computed (${c.id}): no such story`);
        continue;
      }
      const g = gradeStory(story);
      if (g.score !== c.score || g.grade !== c.grade)
        fail(`computed (${c.id}): says ${String(c.score)}/${String(c.grade)}, formula gives ${g.score}/${g.grade}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
