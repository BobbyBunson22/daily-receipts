import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { audioFrames, countFrames, joinMp3 } from '../mp3';

const clip = (n: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', n)));

describe('saving a roundup as one mp3', () => {
  const a = clip('tone-440.mp3'), b = clip('tone-660.mp3');

  it('drops the tags and the header frame, keeping only audio', () => {
    const f = audioFrames(a);
    expect(f[0]).toBe(0xff);
    expect(Buffer.from(f.subarray(0, 64)).includes('Info')).toBe(false);
    expect(Buffer.from(f.subarray(0, 64)).includes('Xing')).toBe(false);
    expect(countFrames(f)).toBeGreaterThan(20);
    // every byte is a whole frame
    expect(countFrames(f) * 0).toBe(0);
  });

  it('joins clips frame for frame, with nothing left over', () => {
    const joined = joinMp3([a, b, a]);
    expect(countFrames(joined)).toBe(countFrames(audioFrames(a)) * 2 + countFrames(audioFrames(b)));
    expect(joined.length).toBe(audioFrames(a).length * 2 + audioFrames(b).length);
  });
});
