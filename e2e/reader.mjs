// Smoke-tests the reader at phone and laptop sizes. Run against a running app:
//   BASE=http://localhost:3100 NODE_PATH=$(npm root -g) node e2e/reader.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3100';
const OUT = process.env.OUT ?? '.';
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
for (const [w, h, touch] of [[360, 640, true], [390, 844, true], [1280, 800, false]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(BASE + '/');
  const tag = `${w}x${h}`;

  // first visit: the tour
  await p.waitForSelector('.tour', { timeout: 5000 });
  check(true, `${tag} welcome tour shows on first visit`);
  await p.screenshot({ path: `${OUT}/tour-${tag}.png` });
  while (await p.getByRole('button', { name: 'Next' }).count()) await p.getByRole('button', { name: 'Next' }).click();
  check(await p.getByRole('button', { name: 'Sign up free' }).count() === 1, `${tag} tour ends by offering free sign-up`);
  await p.getByRole('button', { name: 'Not now' }).click();
  check(!(await p.$('.tour')), `${tag} tour closes`);
  check(await p.getByRole('button', { name: 'How it works' }).count() >= 1, `${tag} the tour can be reopened`);

  // then, once a day: the fact and the question
  await p.waitForSelector('.daily', { timeout: 5000 });
  check((await p.textContent('.daily-fact p')).length > 20, `${tag} daily fact shows after the tour`);
  check(/\?$/.test((await p.textContent('.daily-qt')).trim()), `${tag} daily question shows`);
  check(await p.evaluate(() => document.querySelector('.daily-card').getBoundingClientRect().right <= innerWidth), `${tag} daily card fits the screen`);
  await p.screenshot({ path: `${OUT}/daily-${tag}.png` });
  await p.getByRole('button', { name: "Don't know" }).click();
  check(/The answer:/.test(await p.textContent('.daily-res')), `${tag} don't know reveals the answer`);
  await p.getByRole('button', { name: "Read today's news" }).click();
  check(!(await p.$('.daily')), `${tag} daily card closes`);

  // the deck
  await p.waitForSelector('#topcard');
  const fit = await p.evaluate(() => [...document.querySelectorAll('.card')].map((c) => {
    const cin = c.querySelector('.cin'); return cin.scrollHeight <= cin.clientHeight + 1;
  }));
  check(fit.every(Boolean), `${tag} every visible card fits its headline`);
  check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag} no sideways scroll`);
  await p.screenshot({ path: `${OUT}/deck-${tag}.png` });

  // checks every headline in the edition fits at this size, by walking the whole deck
  const allFit = await p.evaluate(async () => {
    const bad = [];
    for (let n = 0; n < 80; n++) {
      const c = document.getElementById('topcard'); if (!c) break;
      const cin = c.querySelector('.cin'), h = c.querySelector('h3');
      const hb = h.getBoundingClientRect(), cb = cin.getBoundingClientRect();
      if (hb.bottom > cb.bottom + 1 || cin.scrollHeight > cin.clientHeight + 1) bad.push(h.textContent);
      document.querySelector('[aria-label="Less like this"]').click();
      await new Promise((r) => setTimeout(r, 300));
    }
    return bad;
  });
  check(allFit.length === 0, `${tag} all headlines show in full ${allFit.length ? JSON.stringify(allFit.slice(0, 3)) : ''}`);
  await p.waitForSelector('text=All caught up.');
  check(true, `${tag} end of deck reached`);
  await p.getByRole('button', { name: 'Start over from story 1' }).click();
  await p.waitForSelector('#topcard');

  // like by button, save by button, undo
  await p.getByRole('button', { name: 'More like this' }).click();
  await p.waitForTimeout(350);
  await p.getByRole('button', { name: 'Save for later' }).first().click();
  await p.waitForTimeout(350);
  check((await p.textContent('.dcount')).startsWith('3 of'), `${tag} two swipes move the deck on`);
  await p.getByRole('button', { name: 'Undo last swipe' }).click();
  check((await p.textContent('.dcount')).startsWith('2 of'), `${tag} undo brings the card back`);

  // keyboard
  if (!touch) {
    await p.focus('#topcard');
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(350);
    check((await p.textContent('.dcount')).startsWith('3 of'), `${tag} arrow key swipes`);
    await p.focus('#topcard');
    await p.keyboard.press('Enter');
    await p.waitForSelector('.sheet .sh-title');
    check(true, `${tag} Enter opens the receipts`);
    await p.keyboard.press('Escape');
    check(!(await p.$('.sheet')), `${tag} Escape closes the sheet`);
  }

  // drag to swipe (touch)
  if (touch) {
    const before = await p.textContent('.dcount');
    const box = await (await p.$('#topcard')).boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
    for (let i = 1; i <= 8; i++) await p.mouse.move(box.x + box.width / 2 + i * 25, box.y + box.height / 2 + 2);
    await p.mouse.up();
    await p.waitForTimeout(400);
    check(before !== (await p.textContent('.dcount')), `${tag} dragging right swipes the card`);
  }

  // story sheet
  await p.click('#topcard', { position: { x: 40, y: 120 } });
  await p.waitForSelector('.sheet .sh-title');
  const sheet = await p.evaluate(() => ({
    sources: document.querySelectorAll('.srcs a').length,
    https: [...document.querySelectorAll('.srcs a')].every((a) => a.href.startsWith('https://')),
    newTab: [...document.querySelectorAll('.srcs a')].every((a) => a.target === '_blank' && a.rel.includes('noopener')),
    grade: document.querySelector('.gb-head b')?.textContent,
  }));
  check(sheet.sources > 0 && sheet.https && sheet.newTab, `${tag} receipts list sources (${sheet.sources}), all https, open in a new tab`);
  check(/^Grade [ABCD]: /.test(sheet.grade ?? ''), `${tag} grade box shows ${sheet.grade}`);
  await p.screenshot({ path: `${OUT}/sheet-${tag}.png` });
  await p.getByRole('button', { name: 'Close' }).click();

  // roundup
  await p.getByRole('button', { name: /^Roundup · / }).click();
  await p.waitForSelector('.sheet .sh-title');
  check((await p.$$('.rlist li')).length >= 1, `${tag} roundup lists liked stories`);
  check(!!(await p.$('text=Play bulletin')), `${tag} roundup has a play button`);
  check(await p.getByRole('radio', { name: /Both/ }).getAttribute('aria-checked') === 'true', `${tag} both newsreaders, taking turns, by default`);
  await p.getByRole('radio', { name: /Emma/ }).click();
  check(await p.getByRole('radio', { name: /Emma/ }).getAttribute('aria-checked') === 'true', `${tag} newsreader can be switched to Emma`);
  check(await p.evaluate(() => JSON.parse(localStorage.getItem('dr.web.v1') ?? '{}').voice) === 'emma', `${tag} the choice is remembered`);
  check(await p.getByRole('button', { name: 'Hear Emma' }).count() === 1, `${tag} each newsreader has a sample button`);
  check(await p.evaluate(() => document.querySelector('.readers').getBoundingClientRect().right <= innerWidth), `${tag} newsreader picker fits the screen`);
  await p.screenshot({ path: `${OUT}/roundup-${tag}.png` });
  await p.getByRole('radio', { name: /Both/ }).click();
  check(await p.getByRole('radio', { name: /Both/ }).getAttribute('aria-checked') === 'true', `${tag} both newsreaders can take turns`);
  check(/George and Emma/.test(await p.textContent('.bstat')) || /device/.test(await p.textContent('.bstat')), `${tag} roundup says who reads it`);
  await p.getByRole('radio', { name: /George/ }).click();
  await p.getByRole('button', { name: 'Close' }).click();

  // settings: topic toggle, grade filter
  await p.getByRole('button', { name: 'Your topics and settings' }).click();
  await p.waitForSelector('.tchips');
  await p.getByRole('button', { name: 'Sport' }).click();
  await p.getByRole('button', { name: 'A–B' }).click();
  await p.screenshot({ path: `${OUT}/settings-${tag}.png`, fullPage: false });
  await p.getByRole('button', { name: 'Close' }).click();
  const grades = await p.evaluate(() => [...document.querySelectorAll('.card .grade')].map((g) => g.textContent));
  check(grades.every((g) => g === 'A' || g === 'B'), `${tag} grade filter hides C and D (${grades.join('')})`);

  // scroll mode
  await p.getByRole('button', { name: 'Scroll' }).click();
  await p.waitForSelector('.intro h1');
  check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag} scroll mode: no sideways scroll`);
  check((await p.$$('#sec-sport')).length === 0, `${tag} removed topic is gone from scroll mode`);
  await p.screenshot({ path: `${OUT}/scroll-${tag}.png` });

  // state survives a reload
  await p.reload();
  await p.waitForSelector('.intro h1');
  check(!(await p.$('.tour')), `${tag} tour doesn't come back after reload`);
  check(!(await p.$('.daily')), `${tag} daily card doesn't come back the same day`);
  check(await p.evaluate(() => JSON.parse(localStorage.getItem('dr.web.v1')).min === 'B'), `${tag} settings kept after reload`);

  // puzzles: list, crossword typing, sudoku entry, Rulebook test, Sure? round
  await p.getByRole('button', { name: 'Swipe', exact: true }).click();
  await p.getByRole('button', { name: 'Puzzles' }).first().click();
  await p.waitForSelector('.pzcard');
  check((await p.$$('.pzcard')).length === 4, `${tag} four puzzles listed`);
  await p.getByRole('button', { name: /Crossword/ }).click();
  await p.waitForSelector('.cwgrid');
  await p.click('.cwc.sel');
  await p.keyboard.type('A');
  check(await p.evaluate(() => [...document.querySelectorAll('.cwc b')].some((b) => b.textContent === 'A')), `${tag} crossword takes a letter`);
  await p.getByRole('button', { name: 'Reveal all' }).click();
  await p.getByRole('button', { name: 'Sure? Tap again' }).click();
  await p.waitForSelector('.pzdone');
  check(/eases off|stays at/.test(await p.textContent('.pzdone')), `${tag} crossword reveal finishes and sets tomorrow's level`);
  await p.screenshot({ path: `${OUT}/crossword-${tag}.png` });
  await p.getByRole('button', { name: 'Back to puzzles' }).click();
  await p.getByRole('button', { name: /Sudoku/ }).click();
  await p.waitForSelector('.sugrid');
  const empty = await p.$('.suc:not(.given)');
  await empty.click();
  await p.click('.supad button:not([disabled])');
  check(await p.evaluate(() => [...document.querySelectorAll('.suc:not(.given)')].some((c) => /^[1-9]$/.test(c.textContent))), `${tag} sudoku takes a number`);
  check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.sugrid').getBoundingClientRect().right <= innerWidth), `${tag} sudoku grid fits the screen`);
  await p.screenshot({ path: `${OUT}/sudoku-${tag}.png` });
  await p.getByRole('button', { name: 'Close' }).click();
  await p.getByRole('button', { name: /Rulebook/ }).click();
  await p.fill('input[aria-label="Word to test"]', 'banana');
  await p.getByRole('button', { name: 'Test', exact: true }).click();
  check(/BANANA (passes|fails)/.test(await p.textContent('.sheet')), `${tag} Rulebook tests a word`);
  await p.getByRole('button', { name: 'Close' }).click();
  await p.getByRole('button', { name: /Sure\?/ }).click();
  for (let q = 0; q < 5; q++) {
    await p.fill('#sr-lo', '1');
    await p.fill('#sr-hi', '1000000');
    await p.getByRole('button', { name: 'Lock it in' }).click();
    await p.getByRole('button', { name: q < 4 ? 'Next question' : 'See my results' }).click();
  }
  check(/of 5 inside your range/.test(await p.textContent('.pzdone')), `${tag} Sure? finishes with a score`);
  await p.getByRole('button', { name: 'Close' }).click();
  await p.getByRole('button', { name: 'Close' }).click().catch(() => {});

  // every button and link has a name
  const unnamed = await p.evaluate(() => [...document.querySelectorAll('button,a')].filter((el) => !(el.getAttribute('aria-label') || el.textContent.trim())).length);
  check(unnamed === 0, `${tag} every control has a label`);
  check(errors.length === 0, `${tag} no page errors ${errors.slice(0, 2).join(' | ')}`);
  await ctx.close();
}
await b.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nAll passed');
process.exit(fails.length ? 1 : 0);
