/**
 * The newsreaders: two free, open-source AI voices (Kokoro) that read each story in full.
 * Clips are recorded each morning by .github/workflows/voice.yml (scripts/voice/record.py).
 * Framework-free.
 */
import LINES from './voice-lines.json';
import type { ClientEdition, ClientStory, Reader } from './types';

export const READERS = LINES.readers as Record<Reader, { name: string; kokoro: string; about: string }>;
export const READER_IDS = Object.keys(READERS) as Reader[];
export const PARTS = LINES.parts as Record<'intro' | 'first' | 'next' | 'finally' | 'outro' | 'sample', string>;

/** voice_clips.voice_id → reader, e.g. "kokoro:bm_george" → "george". */
export const READER_BY_VOICE: Record<string, Reader> = Object.fromEntries(READER_IDS.map((r) => [`kokoro:${READERS[r].kokoro}`, r]));

/** Speech-friendly text: ranges read as "to", dashes as pauses. Must match spoken() in scripts/voice/record.py. */
export const speakable = (t: string) =>
  String(t).replace(/(\d)\s*[–-]\s*(\d)/g, '$1 to $2').replace(/[–—]/g, ', ').replace(/\s+/g, ' ').trim();

/** What the newsreader reads for a story: the headline, then the report as written for the ear (or the full report). */
export const readingScript = (s: Pick<ClientStory, 'head' | 'body' | 'spoken'>) =>
  [speakable(s.head).replace(/\.$/, '') + '.', ...(s.spoken?.length ? s.spoken : s.body).filter((p) => p && p.trim()).map(speakable)].join('\n\n');

/** A newsreader's recording of one of the fixed lines, when the edition says where they live. */
export const partUrl = (ed: Pick<ClientEdition, 'voiceBase'>, reader: Reader, key: keyof typeof PARTS) =>
  ed.voiceBase ? `${ed.voiceBase}/${reader}/parts/v${LINES.version}/${key}.mp3` : null;
