// Sharing a story, and opening a shared link. Run against a running app:
//   BASE=http://localhost:3100 NODE_PATH=$(npm root -g) node e2e/share.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3100';
const OUT = process.env.OUT ?? '.';
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
for (const [w, h, touch] of [[390, 844, true], [1280, 800, false]]) {
  const tag = `${w}x${h}`;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  // a returning reader: no tour, no daily card
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('dr.web.v1')) localStorage.setItem('dr.web.v1', JSON.stringify({ toured: 99 }));
    localStorage.setItem('dr.daily.v1', JSON.stringify({ seen: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }), ans: {} }));
    // no share sheet in this browser: the link is copied instead
    try { delete Navigator.prototype.share; } catch { /* fine */ }
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));

  // share from the top card
  await p.goto(BASE + '/');
  await p.waitForSelector('#topcard');
  const before = await p.textContent('.dcount');
  const head = (await p.textContent('#topcard h3')).trim();
  await p.click('#topcard .cshare');
  await p.waitForSelector('.toast.on');
  check(/Link copied/.test(await p.textContent('.toast')), `${tag} card share copies the link`);
  const link = await p.evaluate(() => navigator.clipboard.readText());
  check(/\/s\/\d+-[a-z0-9-]+$/.test(link), `${tag} the link is a story link (${link})`);
  check(await p.textContent('.dcount') === before && !(await p.$('.sheet')), `${tag} sharing doesn't swipe or open the card`);

  // share from the full story
  await p.click('#topcard h3');
  await p.waitForSelector('.sheet .sh-title');
  check(await p.getByRole('button', { name: 'Share this receipt' }).count() === 1, `${tag} the full story has a share button`);
  await p.getByRole('button', { name: 'Close' }).click();

  // scroll view items
  await p.getByRole('button', { name: 'Scroll' }).click();
  await p.waitForSelector('.item');
  check(await p.$$eval('.item', (els) => els.every((e) => e.querySelector('.rb.share'))), `${tag} every scroll item has a share button`);

  // open the shared link as a new reader
  const ctx2 = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  const q = await ctx2.newPage();
  await q.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
  await q.waitForSelector('.sheet .sh-title');
  check((await q.textContent('.sheet .sh-title')).trim() === head, `${tag} the shared link opens that story`);
  check(!(await q.$('.tour')), `${tag} the welcome tour waits until the story is closed`);
  await q.screenshot({ path: `${OUT}/shared-${tag}.png` });
  await q.getByRole('button', { name: 'Close' }).first().click();
  await q.waitForSelector('.tour', { timeout: 5000 });
  check(true, `${tag} then the welcome tour shows`);
  // the roundup: share and save buttons
  await p.goto(BASE + '/');
  await p.getByRole('button', { name: 'Swipe', exact: true }).click();
  await p.waitForSelector('#topcard', { timeout: 5000 }).catch(async () => { await p.screenshot({ path: `${OUT}/debug-${tag}.png` }); throw new Error('no top card'); });
  for (let k = 0; k < 2; k++) {
    await p.getByRole('button', { name: 'More like this', exact: true }).click();
    await p.waitForTimeout(600);
  }
  await p.getByRole('button', { name: /^Roundup · [1-9]/ }).click();
  await p.waitForSelector('.rshare-row');
  check(await p.getByRole('button', { name: /Share your roundup/ }).count() === 1, `${tag} roundup has a share button`);
  check(await p.getByRole('button', { name: 'Save audio' }).count() === 1, `${tag} roundup has save audio`);
  await p.getByRole('button', { name: 'Close' }).click();
  await p.getByRole('button', { name: 'Your topics and settings' }).click();
  await p.fill('#dr-name', 'jay');
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await p.getByRole('button', { name: 'Close' }).click();
  check(/Jay’s Receipts/.test(await p.textContent('.mast-k')), `${tag} a username makes it Jay’s Receipts`);
  await p.getByRole('button', { name: /^Roundup · [1-9]/ }).click();
  check(/Jay’s roundup/.test(await p.textContent('.sheet .sh-title')), `${tag} and Jay’s roundup`);
  check(await p.getByRole('button', { name: /Share Jay’s roundup/ }).count() === 1, `${tag} shared by name`);
  await p.getByRole('button', { name: 'Close' }).click();

  // a shared roundup, opened by a friend
  const ctx3 = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  const r = await ctx3.newPage();
  const rerr = [];
  r.on('pageerror', (e) => rerr.push(e.message));
  await r.goto(BASE + '/r/abc123xy');
  await r.waitForSelector('.rs-head h1');
  check(/roundup/.test(await r.textContent('.rs-head h1')), `${tag} shared roundup page shows whose it is`);
  check(await r.getByRole('button', { name: 'Play' }).count() === 1 && await r.getByRole('button', { name: 'Save audio' }).count() === 1, `${tag} it has play and save audio`);
  check(await r.$$eval('.rlist a.hl', (as) => as.length > 0 && as.every((a) => /\/s\/\d+-/.test(a.getAttribute('href')))), `${tag} its stories link to their receipts`);
  check(await r.getByRole('link', { name: /Read today/ }).count() === 1, `${tag} and invites the friend in`);
  check(await r.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag} it fits the screen`);
  await r.screenshot({ path: `${OUT}/roundup-page-${tag}.png`, fullPage: true });
  check(rerr.length === 0, `${tag} no errors on the roundup page ${rerr.join(' | ')}`);
  await ctx3.close();
  check(errors.length === 0, `${tag} no page errors ${errors.join(' | ')}`);
  await ctx2.close();
  await ctx.close();
}
await b.close();
console.log(fails.length ? `\n${fails.length} failed` : '\nAll passed');
process.exit(fails.length ? 1 : 0);
