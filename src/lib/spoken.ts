/**
 * Spoken scripts: a story rewritten for the ear, for the newsreaders. Same facts as the written
 * report, in shorter sentences with the attribution first. Trust rule: a spoken script may not
 * say anything the story doesn't, so this checks every number, name and quote against the
 * story's own text. A script that fails is dropped and the written report is read instead.
 * Framework-free.
 */
import type { Story } from '../types/edition';

type Spoken = Pick<Story, 'head' | 'stand' | 'body' | 'kept' | 'say' | 'fig' | 'open'> & { spoken?: unknown };

// Ordinary words that can start a spoken sentence without being a name from the story.
const OPENERS = new Set(`a an the and but so yet or nor for in on at by of to from with without after before
during since until while as if when where why how what which who whose that this these those there here
it its he she they them his her their we our you your i one two three four five six seven eight nine ten
meanwhile elsewhere now still also however even only both some many most more few several each every all
earlier later today yesterday tonight tomorrow this week separately overall instead otherwise then next
first finally according speaking asked writing police officials experts critics analysts investors
researchers scientists campaigners residents ministers prosecutors judges doctors fans players people
not no nothing none neither either just about around nearly almost under over between among against
despite because although though unless whether across away back down off out up again once dozens hundreds thousands millions`.split(/\s+/));

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const num = (s: string) => s.replace(/,/g, '').replace(/\.0+$/, '');
const QUOTE = /[“"]([^”"]{3,})[”"]|‘([^’]{8,})’/g;

function sourceText(s: Spoken): string {
  return [s.head, s.stand, ...(s.body ?? []), ...(s.kept ?? []).map((k) => k[0]), s.say ?? '', ...(s.fig ?? []), ...(s.open ?? [])].join('\n');
}

/** What's wrong with a story's spoken script; empty when it's fine to read. */
export function checkSpoken(s: Spoken): string[] {
  const out: string[] = [];
  const sp = s.spoken;
  if (!Array.isArray(sp) || !sp.length || sp.length > 10 || !sp.every((p) => typeof p === 'string' && p.trim()))
    return ['spoken must be 1 to 10 paragraphs of text'];
  const text = (sp as string[]).join('\n');
  const src = sourceText(s);
  const bodyLen = (s.body ?? []).join(' ').length;
  if (text.length > bodyLen * 1.5 + 200) out.push(`spoken is much longer than the report (${text.length} vs ${bodyLen} characters)`);
  if (text.length < 80) out.push('spoken is too short');

  const srcNums = new Set((src.match(NUMBER) ?? []).map(num));
  for (const n of text.match(NUMBER) ?? []) if (!srcNums.has(num(n))) out.push(`number ${n} is not in the story`);

  const srcLower = src.toLowerCase();
  for (const w of ['dozens', 'hundreds', 'thousands', 'millions', 'billions', 'trillion', 'billion', 'million'])
    if (new RegExp(`\\b${w}\\b`, 'i').test(text) && !srcLower.includes(w) && !(w === 'billion' && /\dbn\b/.test(src)) && !(w === 'million' && /\dm\b/.test(src)))
      out.push(`"${w}" is not in the story`);

  // names: every capitalised word must be in the story, except ordinary sentence openers
  const srcWords = new Set(src.split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean));
  const srcWordsLower = new Set([...srcWords].map((w) => w.toLowerCase()));
  for (const sentence of text.split(/(?<=[.!?:;])\s+|\n+/)) {
    const words = sentence.split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean);
    words.forEach((w, i) => {
      const bare = w.replace(/[’']s$/, '');
      if (!/^\p{Lu}/u.test(bare)) return;
      if (srcWords.has(bare) || srcWords.has(w)) return;
      if (i === 0 && (OPENERS.has(bare.toLowerCase()) || srcWordsLower.has(bare.toLowerCase()))) return;
      out.push(`name "${bare}" is not in the story`);
    });
  }

  // quotes: word for word from the story, or not at all
  const flat = (x: string) => x.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').toLowerCase();
  for (const m of text.matchAll(QUOTE)) {
    const q = (m[1] ?? m[2]).trim();
    if (!flat(src).includes(flat(q))) out.push(`quote "${q.slice(0, 40)}" is not in the story`);
  }
  return [...new Set(out)];
}
