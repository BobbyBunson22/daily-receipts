import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { mastDate, shortDate } from '../components/brand';
import { loadEdition } from '../lib/reader/loadEdition';

export const alt = "Today's Daily Receipts: the date, the issue number and the top story";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 300;

const NAVY = '#0d1836';
const NAVY3 = '#24345f';
const PAPER = '#fcfbf8';
const INK2 = '#5c616e';
const SOFT = '#a9b3d3';

/** The torn-slip logo, drawn with boxes because share images can't render SVG text. */
function LogoBox({ scale = 1 }: { scale?: number }) {
  const w = 72 * scale;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: w, alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: w, height: 80 * scale, background: NAVY, borderRadius: `${8 * scale}px ${8 * scale}px 0 0`, paddingTop: 14 * scale }}>
        <span style={{ color: PAPER, fontFamily: 'Bricolage', fontSize: 34 * scale, lineHeight: 1, letterSpacing: -1 }}>DR</span>
        <div style={{ width: 40 * scale, borderTop: `${2 * scale}px dashed ${PAPER}`, marginTop: 8 * scale }} />
        <svg width={28 * scale} height={20 * scale} viewBox="0 0 28 20" style={{ marginTop: 4 * scale }}><path d="M3 10l7 6L25 3" fill="none" stroke={PAPER} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <svg width={w} height={8 * scale} viewBox="0 0 72 8" preserveAspectRatio="none"><path d="M0 0h72v0l-6 8-6-8-6 8-6-8-6 8-6-8-6 8-6-8-6 8-6-8-6 8-6-8z" fill={NAVY} /></svg>
    </div>
  );
}

export default async function Image() {
  const fonts = join(process.cwd(), 'assets', 'fonts');
  const [disp, mono, mono4] = await Promise.all([
    readFile(join(fonts, 'bricolage-grotesque-latin-800-normal.woff')),
    readFile(join(fonts, 'ibm-plex-mono-latin-600-normal.woff')),
    readFile(join(fonts, 'ibm-plex-mono-latin-400-normal.woff')),
  ]);
  let ed = null;
  try {
    ed = await loadEdition();
  } catch {
    ed = null;
  }
  const top = ed ? ed.stories.slice().sort((a, b) => b.importance - a.importance)[0] : null;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: NAVY, padding: '56px 64px', fontFamily: 'Mono' }}>
        {/* the receipt slip */}
        <div style={{ display: 'flex', flexDirection: 'column', width: 640, transform: 'rotate(-2deg)', marginTop: 4 }}>
          <div style={{ display: 'flex', flexDirection: 'column', background: PAPER, borderRadius: '18px 18px 0 0', padding: '34px 40px 30px', boxShadow: '0 24px 60px rgba(0,0,0,.45)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, paddingBottom: 20, borderBottom: '3px dashed #c8c4ba' }}>
              <LogoBox scale={0.62} />
              <span style={{ fontSize: 22, letterSpacing: 2, color: INK2, textTransform: 'uppercase' }}>{ed ? `No. ${ed.issue} · ${shortDate(ed.date)}` : 'Daily edition'}</span>
            </div>
            <span style={{ marginTop: 24, fontSize: 22, letterSpacing: 3, color: INK2, textTransform: 'uppercase' }}>Today&apos;s Daily Receipts</span>
            <span style={{ marginTop: 6, fontFamily: 'Bricolage', fontSize: 66, lineHeight: 1.02, letterSpacing: -2.5, color: NAVY }}>{ed ? mastDate(ed.date) : "Today's news"}</span>
            {top && (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 22, paddingTop: 18, borderTop: '3px dashed #c8c4ba' }}>
                <span style={{ fontSize: 18, letterSpacing: 2, color: INK2, textTransform: 'uppercase' }}>Top story · Grade {top.grade}</span>
                <span style={{ marginTop: 6, fontFamily: 'Bricolage', fontSize: 34, lineHeight: 1.12, letterSpacing: -0.8, color: NAVY, maxHeight: 118, overflow: 'hidden' }}>{top.head}</span>
              </div>
            )}
          </div>
          <svg width="640" height="16" viewBox="0 0 640 16" preserveAspectRatio="none"><path d={`M0 0h640${Array.from({ length: 40 }, (_, i) => `l-8 16-8-16`).join('')}z`} fill={PAPER} /></svg>
        </div>
        {/* the promise */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', marginLeft: 64, flex: 1, color: PAPER }}>
          <span style={{ fontFamily: 'Bricolage', fontSize: 58, lineHeight: 1.02, letterSpacing: -2 }}>Today&apos;s news,</span>
          <span style={{ fontFamily: 'Bricolage', fontSize: 58, lineHeight: 1.02, letterSpacing: -2, color: SOFT }}>with receipts.</span>
          {ed && (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34, gap: 10, fontFamily: 'Mono4', fontSize: 22, color: SOFT, textTransform: 'uppercase', letterSpacing: 1.5 }}>
              <span>— {ed.stories.length} stories</span>
              <span>— {ed.outletCount} outlets checked</span>
              <span>— Every fact sourced</span>
            </div>
          )}
          <div style={{ display: 'flex', marginTop: 36, paddingTop: 18, borderTop: `2px solid ${NAVY3}`, fontSize: 20, color: SOFT, letterSpacing: 2, textTransform: 'uppercase' }}>Daily Receipts</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Bricolage', data: disp, weight: 800, style: 'normal' },
        { name: 'Mono', data: mono, weight: 600, style: 'normal' },
        { name: 'Mono4', data: mono4, weight: 400, style: 'normal' },
      ],
    },
  );
}
