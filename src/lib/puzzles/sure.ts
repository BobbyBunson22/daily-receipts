/** Sure?: give a range you're 90% sure of; scored with the interval score, a proper scoring rule. */
import { isFresh, newsNumbers, type NewsStory } from './daily';
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

/** More questions for the web app's daily rotation (from issue 11). Long-settled facts only. */
export const SR_Q_MORE: SureQ[] = [
["How many squares are on a chessboard?","squares",64,null,"An 8 × 8 board."],
["How many players does a rugby union team have on the pitch?","players",15,null,"Rugby league has 13."],
["How tall is Yr Wyddfa (Snowdon)?","metres",1085,null,"The highest mountain in Wales."],
["How long is the Channel Tunnel?","kilometres",50,null,"About 50 km, 38 of them under the sea."],
["How many stripes are on the US flag?","stripes",13,null,"One for each of the original colonies."],
["In what year did the Titanic sink?","year",1912,50,"It sank on 15 April 1912."],
["In what year did the Berlin Wall fall?","year",1989,50,"The border opened on 9 November 1989."],
["In what year was the Battle of Hastings?","year",1066,50,"William of Normandy defeated Harold II."],
["At what temperature does water boil at sea level, in Fahrenheit?","°F",212,null,"100 °C."],
["How long does sunlight take to reach Earth?","minutes",8.3,null,"About 8 minutes 20 seconds."],
["How many hours are in a year that isn't a leap year?","hours",8760,null,"365 × 24."],
["How many sides does a 50p coin have?","sides",7,null,"A curved heptagon, so it rolls smoothly."],
["How many letters are in the Greek alphabet?","letters",24,null,"From alpha to omega."],
["How deep is the Challenger Deep, the deepest point of the ocean?","metres",10935,null,"Estimates range from about 10,900 to 11,000 m."],
["In what year did people first walk on the Moon?","year",1969,50,"Apollo 11, 20 July 1969."],
["How many bones are in one human hand, including the wrist?","bones",27,null,"8 in the wrist, 5 in the palm and 14 in the fingers."],
["How many days does the Moon take to orbit Earth?","days",27.3,null,"27.3 days; the cycle of phases takes about 29.5."],
["How tall is the Burj Khalifa?","metres",828,null,"The world's tallest building since 2010."],
["In what year did Queen Victoria come to the throne?","year",1837,50,"She reigned until 1901."],
["How many squares are on a Scrabble board?","squares",225,null,"A 15 × 15 grid."],
["How many tiles are in an English-language Scrabble set?","tiles",100,null,"Including two blanks."],
["In what year was the NHS founded?","year",1948,50,"It launched on 5 July 1948."],
["In what year did the UK switch to decimal currency?","year",1971,50,"Decimal Day was 15 February 1971."],
["How long is the M25?","kilometres",188,null,"About 117 miles around London."],
["In what year did the London Underground open?","year",1863,50,"The Metropolitan Railway opened in January 1863."],
["How many players does a netball team have on court?","players",7,null,"Each has a bib showing their position."],
["What is the average distance from Earth to the Sun?","million kilometres",149.6,null,"About 149.6 million km, one astronomical unit."],
["In what year was Shakespeare born?","year",1564,50,"Baptised in Stratford-upon-Avon in April 1564."],
["In what year was the Great Fire of London?","year",1666,50,"It began in Pudding Lane in September 1666."],
["In what year did the Wright brothers make their first powered flight?","year",1903,50,"At Kitty Hawk, North Carolina, in December 1903."],
["In what year did some British women first vote in a general election?","year",1918,50,"Women over 30 who met a property qualification."],
["In what year was the first FA Cup final?","year",1872,50,"Wanderers beat Royal Engineers 1–0."],
["In what year was the first Tour de France?","year",1903,50,"Maurice Garin won."],
["In what year did Tim Berners-Lee propose the World Wide Web?","year",1989,50,"He wrote the proposal at CERN in March 1989."],
["How many years did the Hundred Years' War last?","years",116,null,"From 1337 to 1453."],
["How many lines are in a sonnet?","lines",14,null,"Shakespeare's end with a rhyming couplet."],
["How many symphonies did Beethoven complete?","symphonies",9,null,"The Ninth ends with the Ode to Joy."],
["What is absolute zero in degrees Celsius?","°C",-273.15,null,"0 kelvin, the lowest possible temperature."],
["How many compartments does a cow's stomach have?","compartments",4,null,"The rumen is the largest."],
["How fast can a cheetah run at full sprint?","km/h",110,null,"Estimates are around 100 to 120 km/h, in short bursts."],
["How many minutes are in a week?","minutes",10080,null,"7 × 24 × 60."],
["How many seconds are in a day?","seconds",86400,null,"24 × 60 × 60."],
["What is the atomic number of gold?","",79,null,"Its symbol, Au, comes from the Latin aurum."],
["How many cells are in a sudoku grid?","cells",81,null,"Nine rows of nine."],
["In what year was the BBC founded, as the British Broadcasting Company?","year",1922,50,"It became a corporation in 1927."],
["In what year did euro notes and coins go into circulation?","year",2002,50,"On 1 January 2002; the euro existed on paper from 1999."],
["In what year did Concorde make its last commercial flights?","year",2003,50,"British Airways retired it in October 2003."],
["How many Wimbledon men's singles titles did Roger Federer win?","titles",8,null,"The last came in 2017."],
["How long is the Suez Canal?","kilometres",193,null,"It opened in 1869."],
["How tall is the Angel of the North?","metres",20,null,"Its wings span 54 m."],
["How tall is the London Eye?","metres",135,null,"It opened in 2000."],
["How many countries share a land border with Germany?","countries",9,null,"From Denmark in the north to Switzerland and Austria in the south."],
["How many countries are in the European Union?","countries",27,null,"Since the UK left in 2020."],
["How long is a cricket pitch, stumps to stumps?","yards",22,null,"About 20 metres."],
["How high is a basketball hoop?","metres",3.05,null,"Exactly 10 feet."],
["How many pieces does each chess player start with?","pieces",16,null,"Eight pawns and eight others."],
["How many coloured stickers are on a standard Rubik's Cube?","stickers",54,null,"Nine on each of six faces."],
["In what year did Elizabeth II become Queen?","year",1952,50,"She acceded on 6 February 1952."],
["In what year did the Forth Bridge open?","year",1890,50,"The rail bridge opened in March 1890."],
["How long is Hadrian's Wall?","miles",73,null,"About 73 miles (117 km), coast to coast."],
["In what year was On the Origin of Species published?","year",1859,50,"Darwin's book sold out on its first day."],
["In what year did Marie Curie win her first Nobel Prize?","year",1903,50,"Physics, shared with Pierre Curie and Henri Becquerel."],
["How much blood is in an average adult body?","litres",5,null,"Around 5 litres, varying with body size."],
["How fast does Earth travel around the Sun?","km per second",30,null,"About 107,000 km/h."],
["How tall is the Elizabeth Tower, home of Big Ben?","metres",96,null,"Big Ben is strictly the bell inside."],
["How long is the arch over Wembley Stadium?","metres",315,null,"It rises 133 m above the pitch."],
["How many seats does Wembley Stadium have?","seats",90000,null,"The largest stadium in the UK."],
["How many vertebrae are in the human spine?","vertebrae",33,null,"Some fuse into the sacrum and coccyx."],
["In what year was the first Glastonbury Festival?","year",1970,50,"Tickets were £1, including free milk."],
["In what year did the Beatles release their first single, Love Me Do?","year",1962,50,"Released in October 1962."],
["In what year was the Royal Society founded?","year",1660,50,"Founded in November 1660."],
["How long is the Panama Canal?","kilometres",82,null,"It opened in 1914."],
["How tall is Kilimanjaro?","metres",5895,null,"Africa's highest mountain."],
["How tall is K2?","metres",8611,null,"The world's second-highest mountain."],
["In what year was Everest first climbed?","year",1953,50,"Edmund Hillary and Tenzing Norgay, 29 May 1953."],
["In what year was Sputnik 1 launched?","year",1957,50,"The first artificial satellite, October 1957."],
["In what year was the Hubble Space Telescope launched?","year",1990,50,"Carried up by the shuttle Discovery."],
["What is Earth's mean diameter?","kilometres",12742,null,"Slightly wider at the equator than pole to pole."],
["How hot is the visible surface of the Sun?","°C",5500,null,"About 5,500 °C; the corona is far hotter."],
["How many players are on a baseball team's fielding side?","players",9,null,"Including the pitcher and catcher."],
["How tall is Mont Blanc?","metres",4806,null,"Its height varies by a metre or two with the snow cap."],
["How many keys are on the bottom letter row of a QWERTY keyboard?","keys",7,null,"Z, X, C, V, B, N and M."],
["How many days are in a leap year?","days",366,null,"February gets a 29th."],
["How many hours ahead of London is Tokyo, when the UK is on GMT?","hours",9,null,"Japan doesn't use daylight saving time."],
["How long is an Olympic swimming pool?","metres",50,null,"Short-course pools are 25 m."],
["How many players are on the pitch for one side in field hockey?","players",11,null,"The same as football."],
["How many furlongs are in a mile?","furlongs",8,null,"A furlong is 220 yards."],
["How many pints are in a UK gallon?","pints",8,null,"A UK gallon is about 4.55 litres."],
["How many grams are in a pound (lb)?","grams",453.6,null,"1 lb = 453.59 g."],
["How many centimetres are in an inch?","centimetres",2.54,null,"Exactly 2.54, by definition since 1959."],
["How long did the Apollo 11 mission last?","days",8,null,"About 8 days 3 hours, launch to splashdown."],
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

/** One Sure? question as the game shows it. */
export interface SureItem { q: string; unit: string; x: number; sc: number; note: string; news?: boolean; head?: string }

const fromBank = ([q, unit, x, sc, note]: SureQ): SureItem => ({ q, unit, x, sc: sc ?? Math.abs(x), note });

/** How many of the five come from today's facts, when there are enough to choose from. */
export const SR_NEWS = 2;

/**
 * Today's five questions. Before issue 11, the prototype's set. From issue 11: two numbers
 * from today's checked facts, then the bank, which rotates three a day and doesn't repeat
 * for weeks.
 */
export function sureQuestions(ed: { issue: number; date: string; stories: NewsStory[] }): SureItem[] {
  if (!isFresh(ed.issue)) return srSet(ed.issue).map((i) => fromBank(SR_Q[i]));
  const news = newsNumbers(ed.stories, ed.date, SR_NEWS).map((n): SureItem => ({ q: n.q, unit: '', x: n.x, sc: Math.abs(n.x), note: n.note, news: true, head: n.head }));
  const bank = [...SR_Q, ...SR_Q_MORE];
  const order = shuffled(bank.map((_, i) => i), rng(seedFrom('sure-bank-2')));
  const per = SR_N - SR_NEWS, start = (ed.issue - 1) * per;
  const rest = Array.from({ length: SR_N - news.length }, (_, k) => fromBank(bank[order[(start + k) % bank.length]]));
  // news questions go second and fourth, so the set opens and closes on the bank
  const out = rest.slice();
  news.forEach((n, k) => out.splice(1 + k * 2, 0, n));
  return out;
}
