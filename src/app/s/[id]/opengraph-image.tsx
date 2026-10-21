/**
 * The preview a shared story shows wherever its link is pasted: the headline on a Daily Receipts
 * slip, with its grade stamped on and how many facts were checked. Only what the edition says.
 */
import { ImageResponse } from 'next/og';

import { shortDate } from '../../../components/brand';
import { GRADE_LABELS } from '../../../lib/grading';
import { CUT, INK2, LogoBox, NAVY, NAVY3, PAPER, SOFT, ogFonts } from '../../og-parts';
import { SITE_URL } from '../../../lib/site';
import { sharedStory } from './story';

export const alt = 'A story from Daily Receipts: its headline, grade and how many facts were checked';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 300;

const headSize = (n: number) => (n <= 50 ? 66 : n <= 75 ? 58 : n <= 100 ? 50 : 44);

/** The grade as a rubber stamp. */
function Stamp({ grade }: { grade: 'A' | 'B' | 'C' | 'D' }) {
  const colour = grade === 'D' ? CUT : NAVY;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 168, height: 168, border: `6px solid ${colour}`, borderRadius: 18, transform: 'rotate(7deg)', color: colour, background: PAPER }}>
      <span style={{ fontFamily: 'Mono', fontSize: 20, letterSpacing: 4, textTransform: 'uppercase' }}>Grade</span>
      <span style={{ fontFamily: 'Bricolage', fontSize: 104, lineHeight: 0.9, marginTop: 2 }}>{grade}</span>
      <span style={{ fontFamily: 'Mono', fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 }}>{GRADE_LABELS[grade].label}</span>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const found = await sharedStory((await params).id).catch(() => null);
  const s = found?.story;
  const sec = s ? found.edition.sections.find((x) => x.id === s.sec)?.name ?? s.sec : '';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: NAVY, padding: '40px 56px 0', fontFamily: 'Mono' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', background: PAPER, borderRadius: '18px 18px 0 0', padding: '28px 40px 26px', boxShadow: '0 24px 60px rgba(0,0,0,.45)', flex: 1 }}>
            {/* the slip's header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, paddingBottom: 18, borderBottom: '3px dashed #c8c4ba' }}>
              <LogoBox scale={0.5} />
              <span style={{ fontFamily: 'Bricolage', fontSize: 30, color: NAVY, letterSpacing: -0.8 }}>Daily Receipts</span>
              <span style={{ marginLeft: 'auto', fontSize: 20, letterSpacing: 2, color: INK2, textTransform: 'uppercase' }}>
                {s ? `${sec} · No. ${found.edition.issue} · ${shortDate(found.edition.date)}` : "Today's news, with receipts"}
              </span>
            </div>
            {/* headline and grade */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 36, flex: 1, paddingTop: 22 }}>
              <span style={{ flex: 1, fontFamily: 'Bricolage', fontSize: s ? headSize(s.head.length) : 66, lineHeight: 1.06, letterSpacing: -1.6, color: NAVY, maxHeight: 290, overflow: 'hidden' }}>
                {s ? s.head : "Today's news, with receipts."}
              </span>
              {s && <Stamp grade={s.grade} />}
            </div>
            {/* the receipts */}
            {s && (
              <div style={{ display: 'flex', gap: 28, paddingTop: 16, borderTop: '3px dashed #c8c4ba', fontSize: 22, letterSpacing: 1.5, color: INK2, textTransform: 'uppercase' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: NAVY }}>
                  <svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill={NAVY} /><path d="M6.5 12.5l3.7 3.7L17.5 8" fill="none" stroke={PAPER} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {s.kept.length} facts checked
                </span>
                <span>{s.sources} {s.sources === 1 ? 'source' : 'sources'}</span>
                <span style={{ color: s.cut.length ? CUT : INK2 }}>{s.cut.length ? `${s.cut.length} ${s.cut.length === 1 ? 'claim' : 'claims'} cut` : 'Nothing cut'}</span>
              </div>
            )}
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
