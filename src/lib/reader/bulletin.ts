'use client';
/**
 * The roundup read aloud as a short bulletin: an intro, "First / Next / Finally", each story
 * read in full (headline, then the report), and a sign-off. The reader's chosen newsreader
 * reads wherever their clip is recorded; the device voice reads the rest, and takes over if a
 * clip fails. Never the grade or source counts.
 */
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
}

export class Bulletin {
  private segs: Segment[] = [];
  private i = 0;
  private audio: HTMLAudioElement | null = typeof Audio !== 'undefined' ? new Audio() : null;
  private preload: HTMLAudioElement | null = null;
  state: PlayerState = { playing: false, paused: false, story: -1, n: 0 };

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
    this.segs = segments(list, ed, reader);
    this.set({ playing: true, paused: false, story: -1, n: list.length });
    this.speakFrom(0);
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
    if (upcoming && typeof Audio !== 'undefined') {
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
      this.audio.src = seg.src;
      this.audio.play().catch(fallback);
      return;
    }
    if (!canSpeak()) return next();
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
