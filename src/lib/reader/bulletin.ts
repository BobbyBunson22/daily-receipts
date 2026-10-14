'use client';
/**
 * The roundup read aloud as a short bulletin: a fixed intro, "First / Next / Finally",
 * each story's spoken line (never the headline, grade or source counts), and a sign-off.
 * Recorded clips in the presenter's AI voice are used where they exist; the device voice
 * reads the rest, and takes over if a clip fails.
 */
import type { ClientEdition, ClientStory } from './types';

export const VOICE_FIXED = {
  intro: 'Hello, and welcome to your Daily Receipts roundup. Here are the stories you picked.',
  first: 'First.',
  next: 'Next.',
  finally: 'Finally.',
  outro: "And that's the news, with the receipts. Thanks for listening, and see you tomorrow.",
} as const;

export const spoken = (t: string) => String(t).replace(/\s*\([^)]*\)/g, '').replace(/–/g, ' to ').replace(/\s+/g, ' ').trim();

/** What gets read for a story: its `say` line, or else its two key facts. */
export const storyScript = (s: ClientStory) => (s.say ? spoken(s.say) : s.kept.slice(0, 2).map(([f]) => spoken(f) + '.').join(' '));

export interface Segment {
  t: string;
  src?: string | null;
  /** Index of the story in the list, or -1 for intro and sign-off. */
  k: number;
}

export function segments(list: ClientStory[], ed: ClientEdition): Segment[] {
  const parts = ed.voice?.parts ?? {};
  const day = ed.date.replace(/,?\s*\d{4}$/, '');
  const segs: Segment[] = [];
  if (parts.intro) segs.push({ src: parts.intro, t: VOICE_FIXED.intro, k: -1 });
  else segs.push({ t: `Here's your Daily Receipts roundup for ${day}. ${list.length} ${list.length === 1 ? 'story' : 'stories'}.`, k: -1 });
  list.forEach((s, i) => {
    const key = list.length === 1 ? '' : i === 0 ? 'first' : i === list.length - 1 ? 'finally' : 'next';
    if (key) segs.push({ src: s.clip ? parts[key] : null, t: VOICE_FIXED[key as keyof typeof VOICE_FIXED], k: i });
    segs.push({ src: s.clip ?? null, t: storyScript(s), k: i });
  });
  segs.push({ src: parts.outro ?? null, t: VOICE_FIXED.outro, k: -1 });
  return segs;
}

export const bulletinMinutes = (list: ClientStory[], ed: ClientEdition) =>
  Math.max(1, Math.round(segments(list, ed).map((x) => x.t).join(' ').split(/\s+/).length / 150));

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

  start(list: ClientStory[], ed: ClientEdition) {
    this.stop();
    if (!list.length) return;
    this.segs = segments(list, ed);
    this.set({ playing: true, paused: false, story: -1, n: list.length });
    this.speakFrom(0);
  }

  toggle(list: ClientStory[], ed: ClientEdition) {
    const seg = this.segs[this.i];
    if (!this.state.playing) return this.start(list, ed);
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
