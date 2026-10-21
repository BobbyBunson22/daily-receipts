/**
 * The roundup read aloud as a short bulletin: the jingle, an intro, "First / Next / Finally", each story
 * read in full (headline, then the report), and a sign-off. The reader's chosen newsreader
 * reads wherever their clip is recorded; the device voice reads the rest, and takes over if a
 * clip fails. Never the grade or source counts.
 */
import { joinMp3 } from './mp3';
import type { ClientEdition, ClientStory, Reader, VoiceChoice } from './types';
import { PARTS, type PartKey, duoLead, openingUrl, otherReader, partText, partUrl, readerFor, readingScript, speakable } from './voices';

export const VOICE_FIXED = {
  intro: PARTS.intro,
  first: PARTS.first,
  next: PARTS.next,
  finally: PARTS.finally,
  outro: PARTS.outro,
} as const;

export const spoken = speakable;

/** The Daily Receipts jingle, played before the bulletin (made by scripts/voice/jingle.py). */
export const JINGLE = '/audio/jingle.mp3';

/** What gets read for a story: the full version. */
export const storyScript = (s: ClientStory) => readingScript(s);

export interface Segment {
  t: string;
  src?: string | null;
  /** Index of the story in the list, or -1 for intro and sign-off. */
  k: number;
}

/** The clip a reader hears for a story: their newsreader's, else the presenter's, else none. */
export const clipFor = (s: ClientStory, reader: Reader) => s.voices?.[reader] ?? s.clip ?? null;

export function segments(list: ClientStory[], ed: ClientEdition, voice: VoiceChoice = 'george'): Segment[] {
  return voice === 'both' ? duoSegments(list, ed) : soloSegments(list, ed, voice);
}

function soloSegments(list: ClientStory[], ed: ClientEdition, reader: Reader): Segment[] {
  const legacy = ed.voice?.parts ?? {};
  const own = (s: ClientStory) => !!s.voices?.[reader];
  const part = (key: keyof typeof VOICE_FIXED, s?: ClientStory) =>
    s ? (own(s) ? partUrl(ed, reader, key) : s.clip ? legacy[key] ?? null : null) : null;
  const lead = list.find(own) ?? list.find((s) => s.clip);
  const segs: Segment[] = [{ src: part('intro', lead), t: VOICE_FIXED.intro, k: -1 }];
  list.forEach((s, i) => {
    const key = list.length === 1 ? '' : i === 0 ? 'first' : i === list.length - 1 ? 'finally' : 'next';
    if (key) segs.push({ src: part(key as keyof typeof VOICE_FIXED, s), t: VOICE_FIXED[key as keyof typeof VOICE_FIXED], k: i });
    segs.push({ src: clipFor(s, reader), t: storyScript(s), k: i });
  });
  segs.push({ src: part('outro', lead), t: VOICE_FIXED.outro, k: -1 });
  return segs;
}

/**
 * Both newsreaders, taking turns story by story, with a short handover between them
 * ("Over to you, Emma." "Thanks, George."). The chat is fixed lines only: no comment on the news.
 */
function duoSegments(list: ClientStory[], ed: ClientEdition): Segment[] {
  const lead = duoLead(ed);
  const reader = (i: number): Reader => readerFor('both', i, ed);
  const recorded = (r: Reader) => list.some((s) => s.voices?.[r]);
  const line = (key: PartKey, r: Reader, k: number): Segment => ({ src: recorded(r) ? partUrl(ed, r, key) : null, t: partText(key, r), k });
  const segs: Segment[] = [{
    src: recorded(lead) && recorded(otherReader(lead)) ? openingUrl(ed) : null,
    t: `${partText('hello', lead)} ${partText('welcome', otherReader(lead))}`,
    k: -1,
  }];
  list.forEach((s, i) => {
    const r = reader(i);
    if (i === 0 && list.length > 1) segs.push(line('first', r, i));
    if (i > 0) {
      // every other handover, the reader handing over says so too
      if (i % 2 === 1) segs.push(line('over1', reader(i - 1), i));
      segs.push(line(i % 2 === 1 ? 'thanks1' : 'thanks2', r, i));
      if (i === list.length - 1 && list.length > 2) segs.push(line('finally', r, i));
    }
    segs.push({ src: s.voices?.[r] ?? null, t: storyScript(s), k: i });
  });
  const last = reader(Math.max(0, list.length - 1));
  segs.push(line('signoff1', last, -1), line('signoff2', otherReader(last), -1));
  return segs;
}

/** Roughly how long the bulletin runs, at a newsreader's pace (about 165 words a minute). */
export const bulletinMinutes = (list: ClientStory[], ed: ClientEdition, voice: VoiceChoice = 'george') =>
  Math.max(1, Math.round(segments(list, ed, voice).map((x) => x.t).join(' ').split(/\s+/).length / 165));

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

function pickVoice(): SpeechSynthesisVoice | null {
  if (!canSpeak()) return null;
  const vs = speechSynthesis.getVoices();
  return (
    vs.find((v) => /en-GB/i.test(v.lang) && /natural|neural|premium|enhanced|siri/i.test(v.name)) ??
    vs.find((v) => /en-GB/i.test(v.lang)) ??
    vs.find((v) => /^en/i.test(v.lang)) ??
    null
  );
}

export interface PlayerState {
  playing: boolean;
  paused: boolean;
  /** Story index being read, -1 for intro/outro. */
  story: number;
  n: number;
  /** How much of the bulletin's audio is held on the device (0 to 1): at 1 it plays without signal. */
  cached?: number;
}

/** Everything the bulletin plays, in order: the jingle, then the bulletin itself. */
export const playlist = (list: ClientStory[], ed: ClientEdition, voice: VoiceChoice = 'george'): Segment[] => [
  { src: JINGLE, t: '', k: -1 },
  ...segments(list, ed, voice),
];

/**
 * Downloads every recorded clip into the device's memory (a few at a time) and returns a map
 * from each clip's address to its in-memory copy, so playback carries on without signal.
 */
export async function fetchClips(srcs: string[], have: Map<string, Blob>, onProgress?: (done: number) => void): Promise<Map<string, Blob>> {
  const todo = [...new Set(srcs)].filter((s) => !have.has(s));
  let done = srcs.length - todo.length;
  onProgress?.(srcs.length ? done / srcs.length : 1);
  const worker = async () => {
    for (let src = todo.shift(); src; src = todo.shift()) {
      try {
        const r = await fetch(src);
        if (r.ok) have.set(src, await r.blob());
      } catch {
        // not recorded or no signal: played from the network, or by the device voice
      }
      onProgress?.(++done / srcs.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return have;
}

/** The bulletin as one mp3 (recorded parts only), for saving. */
export async function bulletinFile(list: ClientStory[], ed: ClientEdition, voice: VoiceChoice, have = new Map<string, Blob>()): Promise<{ blob: Blob; missing: number } | null> {
  const segs = playlist(list, ed, voice);
  const srcs = segs.map((x) => x.src).filter((x): x is string => !!x);
  await fetchClips(srcs, have);
  const parts = await Promise.all(srcs.filter((s) => have.has(s)).map(async (s) => new Uint8Array(await have.get(s)!.arrayBuffer())));
  if (parts.length < 2) return null;
  const missing = list.filter((s, i) => !segs.some((x) => x.k === i && x.src && have.has(x.src) && x.t === storyScript(s))).length;
  return { blob: new Blob([joinMp3(parts) as BlobPart], { type: 'audio/mpeg' }), missing };
}

export class Bulletin {
  private segs: Segment[] = [];
  private i = 0;
  private audio: HTMLAudioElement | null = typeof Audio !== 'undefined' ? new Audio() : null;
  private preload: HTMLAudioElement | null = null;
  /** Clips held in memory, by address, and their in-memory addresses. */
  readonly clips = new Map<string, Blob>();
  private local = new Map<string, string>();
  state: PlayerState = { playing: false, paused: false, story: -1, n: 0, cached: 0 };

  constructor(private onChange: (s: PlayerState, event?: 'done' | 'error') => void) {
    if (canSpeak()) {
      try {
        speechSynthesis.getVoices();
      } catch {
        // ignore
      }
    }
  }

  private set(patch: Partial<PlayerState>, event?: 'done' | 'error') {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state, event);
  }

  start(list: ClientStory[], ed: ClientEdition, reader: VoiceChoice = 'george') {
    this.stop();
    if (!list.length) return;
    // the jingle first; if it can't play, the bulletin simply starts
    this.segs = playlist(list, ed, reader);
    this.set({ playing: true, paused: false, story: -1, n: list.length });
    this.speakFrom(0);
    // meanwhile, bring the whole bulletin onto the device
    void fetchClips(this.segs.map((x) => x.src).filter((x): x is string => !!x), this.clips, (f) => this.set({ cached: f }));
  }

  /** The address to play a clip from: its copy in memory when there is one. */
  private addr(src: string) {
    const blob = this.clips.get(src);
    if (!blob || typeof URL === 'undefined') return src;
    let u = this.local.get(src);
    if (!u) {
      u = URL.createObjectURL(blob);
      this.local.set(src, u);
    }
    return u;
  }

  toggle(list: ClientStory[], ed: ClientEdition, reader: VoiceChoice = 'george') {
    const seg = this.segs[this.i];
    if (!this.state.playing) return this.start(list, ed, reader);
    if (!this.state.paused) {
      if (seg?.src && this.audio) this.audio.pause();
      else if (canSpeak()) speechSynthesis.cancel();
      return this.set({ paused: true });
    }
    this.set({ paused: false });
    if (seg?.src && this.audio && this.audio.src && !this.audio.ended) {
      this.audio.play().catch(() => this.speakFrom(this.i));
    } else this.speakFrom(this.i);
  }

  next() {
    if (!this.state.playing) return;
    const j = this.segs.findIndex((x, idx) => idx > this.i && x.k > this.state.story);
    this.set({ paused: false });
    this.speakFrom(j < 0 ? this.segs.length - 1 : j);
  }

  /** Plays one short clip (a newsreader's sample), stopping the bulletin. Resolves when it ends: false if it couldn't play. */
  sample(src: string): Promise<boolean> {
    this.stop();
    if (!this.audio) return Promise.resolve(false);
    const a = this.audio;
    return new Promise((done) => {
      a.onended = () => done(true);
      a.onerror = () => done(false);
      a.src = src;
      a.play().catch(() => done(false));
    });
  }

  stop(done = false) {
    if (canSpeak()) speechSynthesis.cancel();
    if (this.audio) {
      this.audio.onended = this.audio.onerror = null;
      this.audio.pause();
    }
    const was = this.state.playing;
    this.segs = [];
    this.i = 0;
    this.set({ playing: false, paused: false, story: -1, n: 0 }, done && was ? 'done' : undefined);
  }

  private speakFrom(i: number) {
    this.i = i;
    if (canSpeak()) speechSynthesis.cancel();
    if (this.audio) {
      this.audio.onended = this.audio.onerror = null;
      this.audio.pause();
    }
    if (i >= this.segs.length) return this.stop(true);
    const seg = this.segs[i];
    const next = () => {
      if (this.state.playing && !this.state.paused && this.i === i) this.speakFrom(i + 1);
    };
    if (this.state.story !== seg.k) this.set({ story: seg.k });
    // fetch the next clip now, so handovers don't wait on the network
    const upcoming = this.segs[i + 1]?.src;
    if (upcoming && !this.clips.has(upcoming) && typeof Audio !== 'undefined') {
      this.preload = new Audio();
      this.preload.preload = 'auto';
      this.preload.src = upcoming;
    }
    if (seg.src && this.audio) {
      const fallback = () => {
        if (this.i !== i || !seg.src || this.state.paused) return;
        seg.src = null; // clip failed: read it with the device voice
        this.speakFrom(i);
      };
      this.audio.onended = next;
      this.audio.onerror = fallback;
      this.audio.src = this.addr(seg.src);
      this.audio.play().catch(fallback);
      return;
    }
    if (!canSpeak() || !seg.t) return next();
    const u = new SpeechSynthesisUtterance(seg.t);
    const v = pickVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = 'en-GB';
    u.rate = 1.03;
    u.onend = next;
    u.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled' && this.i === i) {
        this.stop();
        this.set({}, 'error');
      }
    };
    speechSynthesis.speak(u);
  }
}
