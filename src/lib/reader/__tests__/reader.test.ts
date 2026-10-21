/** Deck ordering, personalisation, saved-list persistence and account merging, on the real 12 October edition. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Edition } from '../../../types/edition';
import { gradeStory } from '../../grading';
import { prepareEdition } from '../../prepareEdition';
import { JINGLE, bulletinMinutes, fetchClips, playlist, segments, spoken, storyScript, VOICE_FIXED } from '../bulletin';
import { READER_BY_VOICE } from '../voices';
import edition2026_10_20 from '../../../../data/edition-2026-10-20.json';
import { DECK_SIZES, MUTED, dealWeight, deckList, extraCount, todays, liked, sectionLists, storyScore, tagAffinity, topStories, visible } from '../personalise';
import { deriveTags, tagKey } from '../tags';
import * as S from '../state';
import { merge, type Remote } from '../sync';
import type { ClientEdition, ClientStory, ReaderState } from '../types';

const raw = JSON.parse(readFileSync(join(__dirname, '../../../../data/edition-2026-10-12.json'), 'utf8')) as Edition;
const { edition } = prepareEdition(raw);
const derivedTags = deriveTags(edition.stories);
const ed: ClientEdition = {
  id: 1,
  issue: edition.edition.issue,
  date: edition.edition.date,
  compiled: edition.edition.compiled,
  sections: edition.sections,
  outletCount: 0,
  stories: edition.stories.map((s, i): ClientStory => {
    const g = gradeStory(s);
    return {
      ...s, id: 100 + i, slug: s.id, primary: s.primary, fig: s.fig ?? null, say: s.say ?? null,
      src: s.src.map(([key, url, note]) => ({ key, url, note: note ?? null, name: key, country: '' })),
      also: (s.also ?? []).map(([key, url]) => ({ key, url, name: key })),
      tags: derivedTags[i],
      sources: g.sources, score: g.score, grade: g.grade, importance: g.importance, clip: null,
    };
  }),
};
const at = 1_760_000_000_000;
const fresh = () => ({ ...S.initialState(ed), maxIssue: ed.issue });
const standard = () => S.initialState(ed);
const byId = (id: number) => ed.stories.find((s) => s.id === id)!;

describe('deck order', () => {
  const tagsOf = (s: ClientStory) => (s.tags ?? []).map(tagKey);
  // a tag shared by two stories in the same topic, to see one swipe affect the other
  const pair = (() => {
    for (const a of ed.stories)
      for (const b of ed.stories)
        if (a.id < b.id && a.sec === b.sec) {
          const shared = tagsOf(a).find((t) => tagsOf(b).includes(t));
          const other = ed.stories.find((c) => c.sec === a.sec && c.id !== a.id && c.id !== b.id && !tagsOf(c).some((t) => tagsOf(a).includes(t)));
          if (shared && other) return { a, b, other, tag: shared };
        }
    throw new Error('no shared tag in the test edition');
  })();
  const pos = (st: ReaderState, s: ClientStory) => deckList(st, ed).findIndex((x) => x.id === s.id);

  it('starts with every story; the reader\'s first topic leads, best story first', () => {
    const d = deckList(fresh(), ed);
    expect(d.length).toBe(ed.stories.length);
    const first = fresh().order[0];
    expect(d[0].sec).toBe(first);
    const firstTopic = d.filter((s) => s.sec === first);
    for (let i = 1; i < firstTopic.length; i++) expect(storyScore(fresh(), firstTopic[i - 1])).toBeGreaterThanOrEqual(storyScore(fresh(), firstTopic[i]));
  });

  it('topics are a hard filter: someone who only picks sport gets only sport, all of it', () => {
    const st = { ...fresh(), order: ['sport'] };
    const d = deckList(st, ed);
    expect(d.length).toBe(ed.stories.filter((s) => s.sec === 'sport').length);
    expect(d.every((s) => s.sec === 'sport')).toBe(true);
  });

  it('the topic order decides the mix: the top choice comes first and gets the most cards early on', () => {
    const order = ['sport', ...fresh().order.filter((x) => x !== 'sport')];
    const st = { ...fresh(), order };
    const d = deckList(st, ed);
    expect(d[0].sec).toBe('sport');
    const early = d.slice(0, 12);
    const count = (sec: string) => early.filter((s) => s.sec === sec).length;
    const sportAvailable = ed.stories.filter((s) => s.sec === 'sport').length;
    for (const sec of order.slice(2)) expect(count('sport') >= count(sec) || count('sport') === sportAvailable).toBe(true);
    expect(dealWeight(0)).toBeGreaterThan(dealWeight(1));
    expect(dealWeight(9)).toBe(1);
  });

  it('a skip teaches about that story, not its section', () => {
    const st = S.react(fresh(), pair.a, -1);
    expect(st.taste.sec).toEqual({});
    expect(st.taste.tag[pair.tag]).toBe(-S.TAG_STEP);
    // the other story about the same thing drops; a story in the same topic about something else doesn't
    expect(storyScore(st, pair.b)).toBeLessThan(storyScore(fresh(), pair.b));
    expect(tagAffinity(st, pair.other)).toBe(0);
  });

  it('a like lifts other stories about the same thing', () => {
    const st = S.react(fresh(), pair.a, 1);
    expect(storyScore(st, pair.b)).toBeGreaterThan(storyScore(fresh(), pair.b));
    expect(pos(st, pair.b)).toBeLessThanOrEqual(pos(fresh(), pair.b));
  });

  it('keep skipping something and its stories go to the back of the deck', () => {
    let st = fresh();
    for (let i = 0; i < 4; i++) st = { ...S.react(st, pair.a, -1), react: {} };
    expect(tagAffinity(st, pair.b)).toBeLessThanOrEqual(MUTED);
    const d = deckList(st, ed);
    const tail = d.slice(-ed.stories.filter((s) => tagAffinity(st, s) <= MUTED).length);
    expect(tail.map((s) => s.id)).toContain(pair.b.id);
  });

  it('removing a topic and raising the minimum grade filter the deck', () => {
    let st = S.toggleTopic(fresh(), 'sport');
    st = S.setMin(st, 'B');
    const v = visible(st, ed);
    expect(v.some((s) => s.sec === 'sport')).toBe(false);
    expect(v.every((s) => s.grade === 'A' || s.grade === 'B')).toBe(true);
  });

  it('swiped cards leave the deck; restart brings them all back but keeps likes and saves', () => {
    const [a, b, c] = deckList(fresh(), ed);
    let st = S.swipe(fresh(), a, 'more', ed, at);
    st = S.swipe(st, b, 'less', ed, at);
    st = S.swipe(st, c, 'later', ed, at);
    expect(deckList(st, ed).length).toBe(ed.stories.length - 3);
    st = S.restart(st);
    expect(deckList(st, ed).length).toBe(ed.stories.length);
    expect(liked(st, ed).map((s) => s.id)).toEqual([a.id]);
    expect(st.saves.map((e) => e.id)).toEqual([c.id]);
  });

  it('saving for later is neutral: no change to taste', () => {
    const s = deckList(fresh(), ed)[0];
    const st = S.swipe(fresh(), s, 'later', ed, at);
    expect(st.taste).toEqual({ sec: {}, sub: {}, tag: {} });
  });

  it('undo reverses the last swipe exactly', () => {
    const st = S.swipe(fresh(), pair.a, 'more', ed, at);
    const { state } = S.undo(st, ed);
    expect(state.react).toEqual({});
    expect(state.swiped).toEqual([]);
    expect(state.taste.tag[pair.tag] ?? 0).toBe(0);
  });

  it('taste is clamped to -10..10, and one tag can be forgotten', () => {
    let st = fresh();
    for (let i = 0; i < 15; i++) st = { ...S.react(st, pair.a, -1), react: {} };
    expect(st.taste.tag[pair.tag]).toBe(-10);
    st = S.forgetTag(st, pair.tag);
    expect(st.taste.tag[pair.tag]).toBeUndefined();
  });

  it('scroll mode shows the top 8, then each topic in order without repeats', () => {
    const top = topStories(fresh(), ed);
    expect(top.length).toBe(8);
    const lists = sectionLists(fresh(), ed, new Set(top.map((s) => s.id)));
    expect(lists.map((l) => l.section.id)).toEqual(fresh().order.filter((id) => lists.some((l) => l.section.id === id)));
    const shown = lists.flatMap((l) => l.list.map((s) => s.id));
    expect(new Set([...shown, ...top.map((s) => s.id)]).size).toBe(ed.stories.length);
  });
});

describe('number of receipts', () => {
  it('standard is 36, quick 18, long 54 (or everything, if the edition has fewer)', () => {
    expect(S.initialState(ed).size).toBe('standard');
    expect(deckList(standard(), ed).length).toBe(Math.min(36, ed.stories.length));
    expect(deckList(S.setSize(standard(), 'quick'), ed).length).toBe(18);
    expect(deckList(S.setSize(standard(), 'long'), ed).length).toBe(Math.min(54, ed.stories.length));
    expect(DECK_SIZES).toEqual({ quick: 18, standard: 36, long: 54 });
  });

  it('the count stays the same as you swipe, even when swipes reorder what is left', () => {
    let st = S.setSize(standard(), 'quick');
    for (const s of deckList(st, ed).slice(0, 5)) st = S.swipe(st, s, 'less', ed, at);
    expect(todays(st, ed).length).toBe(18);
    expect(deckList(st, ed).length).toBe(13);
  });

  it('maximum receipts adds every other story in your topics, for today only', () => {
    const st = S.setSize(standard(), 'quick');
    expect(extraCount(st, ed)).toBe(ed.stories.length - 18);
    const max = S.showMax(st, ed);
    expect(todays(max, ed).length).toBe(ed.stories.length);
    expect(extraCount(max, ed)).toBe(0);
    const tomorrow: ClientEdition = { ...ed, issue: ed.issue + 1 };
    expect(S.normalise(JSON.parse(JSON.stringify(max)), tomorrow).maxIssue).toBe(0);
    expect(S.normalise(JSON.parse(JSON.stringify(max)), ed).maxIssue).toBe(ed.issue);
  });
});

describe('saved for later', () => {
  it('keeps a full copy of the story, so it outlives the edition', () => {
    const s = ed.stories[3];
    const st = S.addSave(fresh(), s, ed, at);
    const stored = JSON.parse(JSON.stringify(st));
    const tomorrow: ClientEdition = { ...ed, issue: ed.issue + 1, date: 'Tuesday, 13 October 2026', stories: ed.stories.slice(10) };
    const next = S.normalise(stored, tomorrow);
    expect(next.saves).toHaveLength(1);
    expect(next.saves[0].s.head).toBe(s.head);
    expect(next.saves[0].s.src.length).toBe(s.src.length);
    expect(next.saves[0].date).toBe(ed.date);
    expect(next.react).toEqual({});
    expect(next.swiped).toEqual([]);
    const groups = S.savedGroups(next, tomorrow);
    expect(groups.map((g) => g.label)).toEqual([ed.date]);
  });

  it('liking a saved story takes it out of the saved list', () => {
    const s = ed.stories[0];
    const st = S.react(S.addSave(fresh(), s, ed, at), s, 1);
    expect(st.saves).toEqual([]);
  });

  it('survives damaged storage', () => {
    expect(S.normalise('nonsense', ed)).toEqual(standard());
    const st = S.normalise({ order: ['world', 'nope', 'world'], min: 'Z', react: { 999999: 1 }, saves: [{ bad: true }] }, ed);
    expect(st.order).toEqual(['world']);
    expect(st.min).toBe('D');
    expect(st.react).toEqual({});
    expect(st.saves).toEqual([]);
  });
});

describe('signing in on a second device', () => {
  it('combines this browser with the account', () => {
    const [a, b, c] = ed.stories;
    let local = S.swipe(fresh(), a, 'more', ed, at);
    local = S.addSave(local, c, ed, at);
    const remote: Remote = {
      profile: { topic_order: ['sport', 'world'], min_grade: 'C', mode: 'scroll' },
      taste: [{ key: `sec:${b.sec}`, score: 4 }],
      reactions: [{ story_id: b.id, value: 1 }],
      swipes: [{ story_id: b.id, action: 'more', created_at: '2026-10-12T07:00:00Z' }],
      saves: [{ story_id: c.id, snapshot: S.snapshot(c, ed, at), created_at: '2026-10-12T07:00:00Z' }],
    };
    const m = merge(local, remote, ed);
    expect(m.order).toEqual(['sport', 'world']);
    expect(m.min).toBe('C');
    expect(m.mode).toBe('scroll');
    expect(Object.keys(m.react).map(Number).sort()).toEqual([a.id, b.id].sort());
    expect(m.swiped).toEqual([a.id, b.id]);
    expect(m.saves.map((e) => e.id)).toEqual([c.id]);
    expect(m.taste.sec[b.sec]).toBe(4);
  });

  it('a brand-new account takes this browser\'s setup', () => {
    const local = S.moveTopic(fresh(), 5, 0);
    const m = merge(local, { profile: { topic_order: [], min_grade: 'D', mode: 'swipe' }, taste: [], reactions: [], swipes: [], saves: [] }, ed);
    expect(m.order).toEqual(local.order);
  });
});

describe('roundup bulletin', () => {
  const voiced = { ...ed, voiceBase: 'https://x/voice/kokoro' };

  it('reads intro, joins, each story in full (headline, then the report), and the sign-off', () => {
    const list = ed.stories.slice(0, 3);
    const segs = segments(list, ed);
    const text = segs.map((s) => s.t);
    expect(text[0]).toBe(VOICE_FIXED.intro);
    expect(text).toContain('First.');
    expect(text).toContain('Next.');
    expect(text).toContain('Finally.');
    expect(text[text.length - 1]).toMatch(/^And that's the news/);
    for (const s of list) {
      const script = storyScript(s);
      expect(text).toContain(script);
      expect(script.startsWith(spoken(s.head).replace(/\.$/, ''))).toBe(true);
      for (const p of s.body) expect(script).toContain(spoken(p));
      expect(script).not.toContain(`Grade ${s.grade}`);
    }
    // with nothing recorded, the device voice reads it all
    expect(segs.every((x) => !x.src)).toBe(true);
  });

  it('uses the chosen newsreader\'s clips, their own fixed lines, and the device voice for gaps', () => {
    const [a, b] = ed.stories;
    const list = [{ ...a, voices: { george: 'g-a.mp3', emma: 'e-a.mp3' } }, { ...b, voices: { george: 'g-b.mp3' } }];
    const emma = segments(list, voiced, 'emma');
    expect(emma[0].src).toBe('https://x/voice/kokoro/emma/parts/v5/intro.mp3');
    expect(emma.filter((x) => x.k === 0).map((x) => x.src)).toEqual(['https://x/voice/kokoro/emma/parts/v5/first.mp3', 'e-a.mp3']);
    // Emma hasn't recorded story b: the device reads its join and the story
    expect(emma.filter((x) => x.k === 1).map((x) => x.src)).toEqual([null, null]);
    const george = segments(list, voiced, 'george');
    expect(george.filter((x) => x.k >= 0).map((x) => x.src)).toEqual([
      'https://x/voice/kokoro/george/parts/v5/first.mp3', 'g-a.mp3', 'https://x/voice/kokoro/george/parts/v5/finally.mp3', 'g-b.mp3',
    ]);
    expect(george[george.length - 1].src).toBe('https://x/voice/kokoro/george/parts/v5/outro.mp3');
  });

  it('both newsreaders take turns, story by story, with a short handover', () => {
    const [a, b, c] = ed.stories;
    const both = { george: 'g.mp3', emma: 'e.mp3' };
    const list = [{ ...a, voices: both }, { ...b, voices: both }, { ...c, voices: both }];
    const duo = { ...voiced, issue: 12 };
    const segs = segments(list, duo, 'both');
    const said = segs.map((x) => x.t);
    // Emma opens, George replies, in one clip
    expect(said.slice(0, 2)).toEqual([
      "Hello, and welcome to your Daily Receipts roundup. I'm Emma. And I'm George. Here are the stories you picked, each one checked against its sources.",
      'First.',
    ]);
    expect(segs[0].src).toBe('https://x/voice/kokoro/both/parts/v5/opening.mp3');
    // story by story: Emma, then George, then Emma
    expect(segs.filter((x) => x.t === storyScript(list[0]))[0].src).toBe('e.mp3');
    expect(segs.filter((x) => x.t === storyScript(list[1]))[0].src).toBe('g.mp3');
    expect(segs.filter((x) => x.t === storyScript(list[2]))[0].src).toBe('e.mp3');
    // handovers: each line in the speaker's own recording
    expect(segs.filter((x) => x.k === 1 && x.t !== storyScript(list[1])).map((x) => [x.t, x.src])).toEqual([
      ['Over to you, George.', 'https://x/voice/kokoro/emma/parts/v5/over1.mp3'],
      ['Thanks, Emma.', 'https://x/voice/kokoro/george/parts/v5/thanks1.mp3'],
    ]);
    expect(segs.filter((x) => x.k === 2 && x.t !== storyScript(list[2])).map((x) => x.t)).toEqual(['Thank you, George.', 'Finally.']);
    expect(said.slice(-2)).toEqual(["And that's the news, with the receipts.", 'Thanks for listening. See you tomorrow.']);
    expect(segs[segs.length - 2].src).toContain('/emma/');
    expect(segs[segs.length - 1].src).toContain('/george/');
    // nothing recorded: the device reads every line
    expect(segments(ed.stories.slice(0, 2), duo, 'both').every((x) => !x.src)).toBe(true);
    expect(S.normalise({ voice: 'both' }, ed).voice).toBe('both');
  });

  it('the jingle comes first, and every recorded clip can be brought onto the phone', async () => {
    const list = [{ ...ed.stories[0], voices: { george: 'https://x/g.mp3', emma: 'https://x/e.mp3' } }];
    const pl = playlist(list, voiced, 'both');
    expect(pl[0]).toEqual({ src: JINGLE, t: '', k: -1 });
    const have = new Map<string, Blob>();
    const seen: number[] = [];
    const fetched: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (u: string) => { fetched.push(u); return new Response(new Blob(['x'])); }) as typeof fetch;
    try {
      await fetchClips([...pl.map((x) => x.src!).filter(Boolean), JINGLE], have, (f) => seen.push(f));
    } finally {
      globalThis.fetch = real;
    }
    expect(new Set(fetched).size).toBe(fetched.length); // each clip once
    expect(have.has('https://x/e.mp3')).toBe(true);
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('reads ranges and dashes the way a newsreader would', () => {
    expect(spoken('Spurs won 3-1 in 2024–25 — at home')).toBe('Spurs won 3 to 1 in 2024 to 25 , at home');
  });

  it('a five-minute roundup is about five full stories', () => {
    const today = edition2026_10_20.stories.slice(0, 5) as unknown as ClientStory[];
    expect(bulletinMinutes(today, ed)).toBeGreaterThanOrEqual(3);
    expect(bulletinMinutes(today, ed)).toBeLessThanOrEqual(7);
  });

  it('the newsreaders\' voices are listed by their recording ids', () => {
    expect(READER_BY_VOICE['kokoro:bm_george']).toBe('george');
    expect(READER_BY_VOICE['kokoro:bf_emma']).toBe('emma');
    // both, taking turns, until a reader picks; a pick is kept
    expect(fresh().voice).toBe('both');
    expect(S.normalise({ voice: 'george' }, ed).voice).toBe('both');
    expect(S.normalise({ voice: 'emma', voicePicked: true }, ed).voice).toBe('emma');
    expect(S.normalise({ voice: 'bob', voicePicked: true }, ed).voice).toBe('both');
    expect(S.setVoice(fresh(), 'george')).toMatchObject({ voice: 'george', voicePicked: true });
    const profile = { topic_order: ed.sections.map((x) => x.id), min_grade: 'D' as const, mode: 'swipe' as const };
    const remote = (voice: 'george' | 'both') => ({ profile: { ...profile, voice }, taste: [], reactions: [], swipes: [], saves: [] });
    expect(merge(fresh(), remote('george'), ed).voice).toBe('george');
    expect(merge(fresh(), remote('both'), ed).voice).toBe('both');
    expect(merge(S.setVoice(fresh(), 'emma'), remote('george'), ed).voice).toBe('emma');
  });
});

describe('welcome tour', () => {
  it('new readers get it, and so does everyone who saw an older version, once', () => {
    expect(S.needsTour(fresh())).toBe(true);
    expect(S.needsTour(S.normalise({ toured: true }, ed))).toBe(true);
    expect(S.needsTour(S.normalise({ toured: S.TOUR_VERSION }, ed))).toBe(false);
    expect(S.needsTour({ ...fresh(), toured: S.TOUR_VERSION })).toBe(false);
  });
});
