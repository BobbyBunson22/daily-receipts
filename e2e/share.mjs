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
  check(errors.length === 0, `${tag} no page errors ${errors.join(' | ')}`);
  await ctx2.close();
  await ctx.close();
}
await b.close();
console.log(fails.length ? `\n${fails.length} failed` : '\nAll passed');
process.exit(fails.length ? 1 : 0);
