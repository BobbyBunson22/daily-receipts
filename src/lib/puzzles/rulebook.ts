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
  // Added for the web app's daily-fresh Rulebook (from issue 11); appended so saved picks keep their meaning.
  { t: 'Contains the letter R', f: (w) => w.includes('r') },
  { t: 'Contains the letter S', f: (w) => w.includes('s') },
  { t: 'Contains the letter O', f: (w) => w.includes('o') },
  { t: 'Contains the letter N', f: (w) => w.includes('n') },
  { t: 'Ends with the letter S', f: (w) => w.endsWith('s') },
  { t: 'Has four letters or fewer', f: (w) => w.length <= 4 },
  { t: 'Contains the letters TH together', f: (w) => w.includes('th') },
  { t: 'Uses only one kind of vowel, like BANANA', f: (w) => new Set(w.match(/[aeiou]/g) ?? []).size === 1 },
  { t: 'Has more vowels than consonants', f: (w) => vowels(w) * 2 > w.length },
  { t: 'Its second letter is a vowel', f: (w) => /^.[aeiou]/.test(w) },
];

const RB_BANK = 'planet apple stream banana echo glass rhythm tower ocean fizz kayak bloom almost quiet zebra otter sky biopsy jumped area level garden fox wizard moon idea strength alpha chimp effort begin dirt noon waxy under eerie throat act jazz oyster'.split(' ');
export const RB_MAX = 12;
export const RB_UNLOCK = 3;

export interface Rulebook { secret: number; opts: number[]; given: { w: string; ok: boolean }[] }

/** `date` is the edition's date label, as in the prototype. */
/** Spare words, for the rare day the headlines can't supply both a pass and a fail. */
const RB_SPARE = (RB_BANK.join(' ') + ' ' + 'anchor ballot bridge castle desert engine forest harbour island jungle kettle lantern meadow nectar orbit pepper quartz rocket saddle tunnel violin walrus yacht cobalt drizzle ember fjord gravel hazel igloo jigsaw kiwi lemon mango nimble oasis pebble quiver ripple sapphire thistle umbrella velvet willow yodel zinc').split(' ');

/**
 * The web app's daily Rulebook (from issue 11): any of the rules can be today's, and the
 * example words come from today's headlines, two that pass and two that fail.
 */
export function makeRulebookDaily(date: string, words: string[]): Rulebook {
  const r = rng(seedFrom(`${date}|rb2`));
  const pool = [...new Set(words.map((w) => w.toLowerCase()).filter((w) => /^[a-z]{3,10}$/.test(w)))];
  const all = RB_RULES.map((_, i) => i);
  // a rule today's words can show both ways
  const order = shuffled(all, r);
  const secret = order.find((i) => pool.filter((w) => RB_RULES[i].f(w)).length >= 2 && pool.filter((w) => !RB_RULES[i].f(w)).length >= 2) ?? order[0];
  const rule = RB_RULES[secret];
  const src = shuffled(pool, r).concat(shuffled(RB_SPARE, r));
  const pass = src.filter((w) => rule.f(w)).slice(0, 2), fail = src.filter((w) => !rule.f(w)).slice(0, 2);
  const others = shuffled(order.filter((i) => i !== secret), r).slice(0, 7);
  return {
    secret,
    opts: shuffled([secret, ...others], r),
    given: shuffled([...pass.map((w) => ({ w, ok: true })), ...fail.map((w) => ({ w, ok: false }))], r),
  };
}

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
