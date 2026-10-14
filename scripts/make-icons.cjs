// Renders the app icons from the torn-slip logo. Run: node scripts/make-icons.cjs (needs Playwright).
const { chromium } = require('playwright');
const path = require('path');
const logo = (fill, ink) => `<svg viewBox="0 0 96 120" xmlns="http://www.w3.org/2000/svg"><path fill="${fill}" d="M6 10a8 8 0 0 1 8-8h68a8 8 0 0 1 8 8v96l-7 8-7-8-7 8-7-8-7 8-7-8-7 8-7-8-7 8-7-8-7 8-7-8z"/><text x="48" y="62" text-anchor="middle" fill="${ink}" style="font-family:'Bricolage Grotesque';font-weight:800;font-stretch:75%;font-size:50px;letter-spacing:-1px">DR</text><path d="M22 78h52" stroke="${ink}" stroke-width="3" stroke-dasharray="5 4"/><path d="M34 90l8 7 18-16" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const font = 'data:font/woff2;base64,' + require('fs').readFileSync(path.resolve(__dirname, '../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wdth-normal.woff2')).toString('base64');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const p = await b.newPage();
  const make = async (size, pad, name, round) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<style>@font-face{font-family:"Bricolage Grotesque";src:url("${font}") format("woff2");font-weight:200 800;font-stretch:75% 100%}
      html,body{margin:0;width:${size}px;height:${size}px;background:#0d1836;display:grid;place-items:center;${round ? 'border-radius:22%;' : ''}}
      svg{height:${Math.round(size * (1 - pad * 2))}px}</style>${logo('#fcfbf8', '#0d1836')}`);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.resolve(__dirname, '../public/icons', name), omitBackground: false });
  };
  await make(192, 0.14, 'icon-192.png');
  await make(512, 0.14, 'icon-512.png');
  await make(512, 0.24, 'maskable-512.png');
  await make(180, 0.14, 'apple-touch-icon.png');
  await make(48, 0.1, 'favicon-48.png');
  await b.close();
})();
