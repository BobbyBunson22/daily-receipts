/** Shared pieces for the share (Open Graph) images: colours, fonts and the torn-slip logo. Server only. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const NAVY = '#0d1836';
export const NAVY3 = '#24345f';
export const PAPER = '#fcfbf8';
export const INK2 = '#5c616e';
export const SOFT = '#a9b3d3';

/** The torn-slip logo, drawn with boxes because share images can't render SVG text. */
export function LogoBox({ scale = 1 }: { scale?: number }) {
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

export const CUT = '#b23a26';

export async function ogFonts() {
  const fonts = join(process.cwd(), 'assets', 'fonts');
  const [disp, mono, mono4] = await Promise.all([
    readFile(join(fonts, 'bricolage-grotesque-latin-800-normal.woff')),
    readFile(join(fonts, 'ibm-plex-mono-latin-600-normal.woff')),
    readFile(join(fonts, 'ibm-plex-mono-latin-400-normal.woff')),
  ]);
  return [
    { name: 'Bricolage', data: disp, weight: 800 as const, style: 'normal' as const },
    { name: 'Mono', data: mono, weight: 600 as const, style: 'normal' as const },
    { name: 'Mono4', data: mono4, weight: 400 as const, style: 'normal' as const },
  ];
}
