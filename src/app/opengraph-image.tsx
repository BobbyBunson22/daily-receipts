import { ImageResponse } from 'next/og';

import { mastDate, shortDate } from '../components/brand';
import { loadEdition } from '../lib/reader/loadEdition';

export const alt = "Today's Daily Receipts: the date, the issue number and the top story";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 300;

import { INK2, LogoBox, NAVY, NAVY3, PAPER, SOFT, ogFonts } from './og-parts';

export default async function Image() {
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
      fonts: await ogFonts(),
    },
  );
}
