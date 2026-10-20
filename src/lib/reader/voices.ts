/**
 * The newsreaders: two free, open-source AI voices (Kokoro) that read each story in full.
 * Clips are recorded each morning by .github/workflows/voice.yml (scripts/voice/record.py).
 * Framework-free.
 */
import LINES from './voice-lines.json';
import type { ClientEdition, ClientStory, Reader, VoiceChoice } from './types';

export const READERS = LINES.readers as Record<Reader, { name: string; kokoro: string; about: string }>;
export const READER_IDS = Object.keys(READERS) as Reader[];
export type PartKey = keyof typeof LINES.parts;
export const PARTS = LINES.parts as Record<PartKey, string>;

/** In a two-handed bulletin, who leads: they take turns by day. */
export const duoLead = (ed: Pick<ClientEdition, 'issue'>): Reader => (ed.issue % 2 === 0 ? 'george' : 'emma');

/** Who reads the i-th story of the roundup. */
export const readerFor = (voice: VoiceChoice, i: number, ed: Pick<ClientEdition, 'issue'>): Reader =>
  voice !== 'both' ? voice : i % 2 === 0 ? duoLead(ed) : otherReader(duoLead(ed));

/** "George", "Emma", or "George and Emma". */
export const choiceName = (voice: VoiceChoice) =>
  voice === 'both' ? `${READERS[duoOrder[0]].name} and ${READERS[duoOrder[1]].name}` : READERS[voice].name;
const duoOrder: Reader[] = ['george', 'emma'];

/** The other newsreader. */
export const otherReader = (r: Reader): Reader => (r === 'george' ? 'emma' : 'george');

/** A fixed line as a newsreader says it, with their own name and the other reader's filled in. */
export const partText = (key: PartKey, reader: Reader) =>
  PARTS[key].replace('{me}', READERS[reader].name).replace('{other}', READERS[otherReader(reader)].name);

/** voice_clips.voice_id → reader, e.g. "kokoro:bm_george" → "george". */
export const READER_BY_VOICE: Record<string, Reader> = Object.fromEntries(READER_IDS.map((r) => [`kokoro:${READERS[r].kokoro}`, r]));

/** Speech-friendly text: ranges read as "to", dashes as pauses. Must match spoken() in scripts/voice/record.py. */
export const speakable = (t: string) =>
  String(t).replace(/(\d)\s*[–-]\s*(\d)/g, '$1 to $2').replace(/[–—]/g, ', ').replace(/\s+/g, ' ').trim();

/** What the newsreader reads for a story: the headline, then the report as written for the ear (or the full report). */
export const readingScript = (s: Pick<ClientStory, 'head' | 'body' | 'spoken'>) =>
  [speakable(s.head).replace(/\.$/, '') + '.', ...(s.spoken?.length ? s.spoken : s.body).filter((p) => p && p.trim()).map(speakable)].join('\n\n');

/** A newsreader's recording of one of the fixed lines, when the edition says where they live. */
export const partUrl = (ed: Pick<ClientEdition, 'voiceBase'>, reader: Reader, key: PartKey) =>
  ed.voiceBase ? `${ed.voiceBase}/${reader}/parts/v${LINES.version}/${key}.mp3` : null;
