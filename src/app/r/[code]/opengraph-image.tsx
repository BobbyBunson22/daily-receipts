/**
 * The preview a shared roundup shows: "Jay’s roundup" on a receipt slip, with a play button,
 * how long it runs, who reads it, and the first few headlines with their grades.
 */
import { ImageResponse } from 'next/og';

import { shortDate } from '../../../components/brand';
import { bulletinMinutes } from '../../../lib/reader/bulletin';
import { roundupFor } from '../../../lib/reader/name';
import { SITE_URL } from '../../../lib/site';
import { choiceName } from '../../../lib/reader/voices';
import { CUT, INK2, LogoBox, NAVY, NAVY3, PAPER, SOFT, ogFonts } from '../../og-parts';
import { sharedRoundup } from './roundup';

export const alt = 'A Daily Receipts roundup: whose it is, how long it runs and its first headlines';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 300;

function Chip({ grade }: { grade: 'A' | 'B' | 'C' | 'D' }) {
  const solid = grade === 'A' || grade === 'B';
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 34, borderRadius: 6, fontFamily: 'Mono', fontSize: 20, flex: 'none',
      background: solid ? (grade === 'A' ? NAVY : NAVY3) : PAPER, color: solid ? PAPER : grade === 'D' ? CUT : INK2, border: solid ? 'none' : `2px solid ${grade === 'D' ? CUT : INK2}` }}>{grade}</span>
  );
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const r = await sharedRoundup((await params).code).catch(() => null);
  const title = r?.name ? roundupFor(r.name) : 'A Daily Receipts roundup';
  const shown = r ? r.stories.slice(0, 3) : [];
  const more = r ? r.stories.length - shown.length : 0;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: NAVY, padding: '40px 56px 0', fontFamily: 'Mono' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', background: PAPER, borderRadius: '18px 18px 0 0', padding: '26px 40px 22px', boxShadow: '0 24px 60px rgba(0,0,0,.45)', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, paddingBottom: 16, borderBottom: '3px dashed #c8c4ba' }}>
              <LogoBox scale={0.5} />
              <span style={{ fontFamily: 'Bricolage', fontSize: 30, color: NAVY, letterSpacing: -0.8 }}>Daily Receipts</span>
              <span style={{ marginLeft: 'auto', fontSize: 20, letterSpacing: 2, color: INK2, textTransform: 'uppercase' }}>{r ? `No. ${r.edition.issue} · ${shortDate(r.edition.date)}` : 'Roundup'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 28, paddingTop: 20 }}>
              {/* play button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 112, height: 112, borderRadius: 56, background: NAVY, flex: 'none' }}>
                <svg width="48" height="52" viewBox="0 0 48 52"><path d="M8 4l36 22-36 22z" fill={PAPER} /></svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontFamily: 'Bricolage', fontSize: 70, lineHeight: 1, letterSpacing: -2.4, color: NAVY }}>{title}</span>
                {r && (
                  <span style={{ marginTop: 10, fontSize: 22, letterSpacing: 1.5, color: INK2, textTransform: 'uppercase' }}>
                    {`${r.stories.length} ${r.stories.length === 1 ? 'story' : 'stories'} · about ${bulletinMinutes(r.stories, r.edition, r.voice)} min · read by ${choiceName(r.voice)}`}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto', paddingTop: 16, borderTop: '3px dashed #c8c4ba' }}>
              {shown.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Chip grade={s.grade} />
                  <span style={{ fontFamily: 'Bricolage', fontSize: 27, color: NAVY, letterSpacing: -0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 960 }}>{s.head}</span>
                </div>
              ))}
              {more > 0 && <span style={{ fontSize: 20, letterSpacing: 1.5, color: INK2, textTransform: 'uppercase' }}>{`+ ${more} more`}</span>}
            </div>
          </div>
          <svg width="1088" height="16" viewBox="0 0 1088 16" preserveAspectRatio="none"><path d={`M0 0h1088${Array.from({ length: 68 }, () => 'l-8 16-8-16').join('')}z`} fill={PAPER} /></svg>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 64, color: SOFT, fontSize: 20, letterSpacing: 2, textTransform: 'uppercase', borderTop: `2px solid ${NAVY3}`, marginTop: 6 }}>
          <span>Today&apos;s news, with receipts.</span>
          <span style={{ color: PAPER }}>{new URL(SITE_URL).host.replace(/^www\./, '')}</span>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
