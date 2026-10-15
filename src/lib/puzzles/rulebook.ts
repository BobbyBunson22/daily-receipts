/** Rulebook: a secret rule decides which words pass; test words, then pick the rule. */
import { rng, seedFrom, shuffled } from './rng';

const vowels = (w: string) => (w.match(/[aeiou]/g) ?? []).length;

export const RB_RULES: { t: string; f: (w: string) => boolean }[] = [
  { t: 'No letter appears twice', f: (w) => new Set(w).size === w.length },
  { t: 'Starts and ends with the same letter', f: (w) => w[0] === w[w.length - 1] },
  { t: 'Has exactly two vowels (A, E, I, O, U)', f: (w) => vowels(w) === 2 },
  { t: 'Its letters are in alphabetical order', f: (w) => [...w].every((c, i) => !i || w[i - 1] <= c) },
  { t: 'Has a double letter, like LL or OO', f: (w) => /(.)\1/.test(w) },
  { t: 'Has an even number of letters', f: (w) => w.length % 2 === 0 },
  { t: 'Starts with a vowel', f: (w) => /^[aeiou]/.test(w) },
  { t: 'Ends with a vowel', f: (w) => /[aeiou]$/.test(w) },
  { t: 'Contains the letter E', f: (w) => w.includes('e') },
  { t: 'Has six or more letters', f: (w) => w.length >= 6 },
  { t: 'Starts with a letter from A to M', f: (w) => w[0] <= 'm' },
  { t: 'Its first letter comes earlier in the alphabet than its last', f: (w) => w[0] < w[w.length - 1] },
  { t: 'Has three or more vowels', f: (w) => vowels(w) >= 3 },
  { t: 'Has exactly one vowel', f: (w) => vowels(w) === 1 },
  { t: 'Contains W, X, Y or Z', f: (w) => /[wxyz]/.test(w) },
  { t: 'Has exactly five letters', f: (w) => w.length === 5 },
  { t: 'Has two vowels side by side', f: (w) => /[aeiou]{2}/.test(w) },
  { t: 'Contains no letter A', f: (w) => !w.includes('a') },
  { t: 'Has three consonants in a row', f: (w) => /[^aeiou]{3}/.test(w) },
];

const RB_BANK = 'planet apple stream banana echo glass rhythm tower ocean fizz kayak bloom almost quiet zebra otter sky biopsy jumped area level garden fox wizard moon idea strength alpha chimp effort begin dirt noon waxy under eerie throat act jazz oyster'.split(' ');
export const RB_MAX = 12;
export const RB_UNLOCK = 3;

export interface Rulebook { secret: number; opts: number[]; given: { w: string; ok: boolean }[] }

/** `date` is the edition's date label, as in the prototype. */
export function makeRulebook(date: string): Rulebook {
  const r = rng(seedFrom(`${date}|rb`));
  const order = shuffled(RB_RULES.map((_, i) => i), r);
  const secret = order[0], rule = RB_RULES[secret];
  const words = shuffled(RB_BANK, r);
  return {
    secret,
    opts: shuffled(order.slice(0, 8), r),
    given: [{ w: words.find((w) => rule.f(w))!, ok: true }, { w: words.find((w) => !rule.f(w))!, ok: false }],
  };
}
