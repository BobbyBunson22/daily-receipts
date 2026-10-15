/** Sure?: give a range you're 90% sure of; scored with the interval score, a proper scoring rule. */
import { rng, seedFrom, shuffled } from './rng';

/** [question, unit, answer, scale (null = the answer itself), note] */
export type SureQ = [string, string, number, number | null, string];
export const SR_Q: SureQ[] = [
["How long is the River Thames?","kilometres",346,null,"About 346 km from the Cotswolds to the North Sea."],
["How tall is Mount Everest, by the 2020 China–Nepal survey?","metres",8849,null,"8,848.86 m, announced in December 2020."],
["How many bones are in an adult human body?","bones",206,null,"Babies start with around 300; many fuse as they grow."],
["What is the average distance from Earth to the Moon?","kilometres",384400,null,"Roughly 30 Earths would fit in the gap."],
["How many keys does a standard piano have?","keys",88,null,"52 white and 36 black."],
["How fast does sound travel through air at 20 °C?","metres per second",343,null,"About 1 km every 3 seconds, the basis of counting after lightning."],
["How many member states does the United Nations have?","countries",193,null,"South Sudan was the most recent to join, in 2011."],
["In what year was the first Oxford–Cambridge Boat Race?","year",1829,50,"Held at Henley; Oxford won."],
["How tall is the Shard in London?","metres",310,null,"It has been the UK's tallest building since 2012."],
["In what year did Newton publish the Principia?","year",1687,50,"It set out his laws of motion and universal gravitation."],
["How many elements are in the periodic table?","elements",118,null,"The seventh row was completed in 2016."],
["How long is a marathon?","kilometres",42.195,null,"Fixed at 42.195 km (26.2 miles) since 1921."],
["What is the diameter of the Moon?","kilometres",3474,null,"A little over a quarter of Earth's diameter."],
["At what temperature does pure iron melt?","°C",1538,null,"Around 1,538 °C."],
["How tall is Ben Nevis?","metres",1345,null,"The highest point in the British Isles."],
["In what year was the Eiffel Tower completed?","year",1889,50,"Built for the 1889 World's Fair in Paris."],
["How fast does light travel in a vacuum?","kilometres per second",299792,null,"Exactly 299,792.458 km/s, by definition."],
["In what year did the Channel Tunnel open?","year",1994,50,"Opened in May 1994."],
["How many teeth does an adult have, including wisdom teeth?","teeth",32,null,"Children have 20 milk teeth."],
["In what year was the Rosetta Stone found?","year",1799,50,"Found by French soldiers near Rashid, Egypt."],
["What is the wingspan of an Airbus A380?","metres",79.8,null,"Just under 80 m."],
["In what year was the first iPhone released?","year",2007,50,"It went on sale in the US in June 2007."],
["How many intersections are on a standard Go board?","points",361,null,"A 19 × 19 grid."],
["In what year was Magna Carta sealed?","year",1215,50,"Sealed by King John at Runnymede."],
["How long is the River Nile?","kilometres",6650,null,"About 6,650 km, though measurements vary."],
["How many Earth days does Mars take to orbit the Sun?","days",687,null,"Nearly two Earth years."],
["How tall is the Statue of Liberty, from ground to torch?","metres",93,null,"About 93 m including its pedestal."],
["In what year did Big Ben's clock start keeping time?","year",1859,50,"The Great Clock at Westminster started in May 1859."],
["What is Earth's circumference at the equator?","kilometres",40075,null,"About 40,075 km."],
["How many hearts does an octopus have?","hearts",3,null,"Two pump blood through the gills, one through the body."]
];

export const SR_N = 5;
const SR_ALPHA = 0.1;

/** The five questions for an edition (same order as the prototype). */
export function srSet(issue: number): number[] {
  const order = shuffled(SR_Q.map((_, i) => i), rng(seedFrom('sure-bank')));
  return Array.from({ length: SR_N }, (_, k) => order[((issue - 1) * SR_N + k) % SR_Q.length]);
}

export const srNum = (s: string) => {
  const t = String(s ?? '').replace(/[,\s_£$]/g, '');
  return t === '' ? NaN : Number(t);
};
export const srFmt = (x: number) => x.toLocaleString('en-GB', { maximumFractionDigits: 3 });
export const srScore = (l: number, u: number, x: number, sc: number) =>
  Math.round(100 / (1 + (4 * (u - l + (2 / SR_ALPHA) * Math.max(0, l - x) + (2 / SR_ALPHA) * Math.max(0, x - u))) / sc));
