/**
 * Joins mp3 clips into one file, for "Save audio". Each clip from ffmpeg starts with an ID3 tag
 * and an "Info" frame that states that clip's length; left in, players would think the whole file
 * is as long as the first clip. So both are dropped and the audio frames are joined. All clips
 * share one format (24 kHz mono), which keeps the joined file playable everywhere. Framework-free.
 */

const BITRATES: Record<'1' | '2', number[]> = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Length in bytes of the Layer III frame starting at i, or 0 if there isn't one. */
export function frameLength(b: Uint8Array, i: number): number {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return 0;
  const version = (b[i + 1] >> 3) & 3; // 3 MPEG-1, 2 MPEG-2, 0 MPEG-2.5
  const layer = (b[i + 1] >> 1) & 3; // 1 Layer III
  if (version === 1 || layer !== 1) return 0;
  const br = BITRATES[version === 3 ? '1' : '2'][(b[i + 2] >> 4) & 15];
  const sr = RATES[version]?.[(b[i + 2] >> 2) & 3];
  if (!br || !sr) return 0;
  const pad = (b[i + 2] >> 1) & 1;
  return Math.floor(((version === 3 ? 144 : 72) * br * 1000) / sr) + pad;
}

const tagAt = (b: Uint8Array, i: number, tag: string) => [...tag].every((c, k) => b[i + k] === c.charCodeAt(0));

/** The audio frames of one clip: no ID3 tags, no Info/Xing/VBRI header frame. */
export function audioFrames(b: Uint8Array): Uint8Array {
  let i = 0;
  if (tagAt(b, 0, 'ID3') && b.length > 10) {
    const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
    i = 10 + size + (b[5] & 0x10 ? 10 : 0);
  }
  while (i < b.length && !frameLength(b, i)) i++;
  const first = frameLength(b, i);
  if (first) {
    for (let k = i + 4; k < Math.min(i + first, i + 48); k++) {
      if (tagAt(b, k, 'Xing') || tagAt(b, k, 'Info') || tagAt(b, k, 'VBRI')) {
        i += first;
        break;
      }
    }
  }
  let end = b.length;
  if (end - 128 >= i && tagAt(b, end - 128, 'TAG')) end -= 128;
  return b.subarray(i, end);
}

/** One mp3 from several. */
export function joinMp3(clips: Uint8Array[]): Uint8Array {
  const parts = clips.map(audioFrames);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** How many audio frames a buffer holds, walking frame by frame (for checks). */
export function countFrames(b: Uint8Array): number {
  let i = 0, n = 0;
  for (let len = frameLength(b, i); len; len = frameLength(b, i)) {
    i += len;
    n++;
  }
  return n;
}
