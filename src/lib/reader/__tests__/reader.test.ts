/** Deck ordering, personalisation, saved-list persistence and account merging, on the real 12 October edition. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Edition } from '../../../types/edition';
import { gradeStory } from '../../grading';
import { prepareEdition } from '../../prepareEdition';
import { segments, storyScript } from '../bulletin';
import { deckList, forYou, liked, sectionLists, topStories, visible } from '../personalise';
import * as S from '../state';
import { merge, type Remote } from '../sync';
import type { ClientEdition, ClientStory } from '../types';

const raw = JSON.parse(readFileSync(join(__dirname, '../../../../data/edition-2026-10-12.json'), 'utf8')) as Edition;
const { edition } = prepareEdition(raw);
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
      sources: g.sources, score: g.score, grade: g.grade, importance: g.importance, clip: null,
    };
  }),
};
const at = 1_760_000_000_000;
const fresh = () => S.initialState(ed);
const byId = (id: number) => ed.stories.find((s) => s.id === id)!;

describe('deck order', () => {
  it('starts with every story, most important first when there is no taste yet', () => {
    const d = deckList(fresh(), ed);
    expect(d.length).toBe(ed.stories.length);
    for (let i = 1; i < d.length; i++) expect(forYou(fresh(), d[i - 1])).toBeGreaterThanOrEqual(forYou(fresh(), d[i]));
  });

  it('liking a section moves its stories up', () => {
    const sport = ed.stories.filter((s) => s.sec === 'sport');
    const before = deckList(fresh(), ed).findIndex((s) => s.sec === 'sport');
    let st = fresh();
    for (const s of sport.slice(0, 3)) st = S.react(st, s, 1);
    const after = deckList(st, ed).findIndex((s) => s.sec === 'sport');
    expect(after).toBeLessThan(before);
  });

  it('putting a topic first in the order lifts it', () => {
    const st = S.moveTopic(fresh(), fresh().order.indexOf('culture'), 0);
    const culture = ed.stories.find((s) => s.sec === 'culture')!;
    expect(forYou(st, culture)).toBeGreaterThan(forYou(fresh(), culture));
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
    expect(st.taste).toEqual({ sec: {}, sub: {} });
  });

  it('undo reverses the last swipe exactly', () => {
    const s = deckList(fresh(), ed)[0];
    const st = S.swipe(fresh(), s, 'more', ed, at);
    const { state } = S.undo(st, ed);
    expect(state.react).toEqual({});
    expect(state.swiped).toEqual([]);
    expect(state.taste.sec[s.sec]).toBe(0);
  });

  it('taste is clamped to -10..10', () => {
    let st = fresh();
    const s = ed.stories[0];
    for (let i = 0; i < 15; i++) st = S.react(S.react(st, s, 1), s, 1, true);
    for (let i = 0; i < 15; i++) st = { ...S.react(st, s, -1), react: {} };
    expect(st.taste.sec[s.sec]).toBe(-10);
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
    expect(S.normalise('nonsense', ed)).toEqual(fresh());
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
  it('reads intro, joins, each story\'s spoken line, and the sign-off; never the headline', () => {
    const list = ed.stories.slice(0, 3);
    const segs = segments(list, ed);
    const text = segs.map((s) => s.t);
    expect(text[0]).toMatch(/^Here's your Daily Receipts roundup for Monday, 12 October\. 3 stories\.$/);
    expect(text).toContain('First.');
    expect(text).toContain('Next.');
    expect(text).toContain('Finally.');
    expect(text[text.length - 1]).toMatch(/^And that's the news/);
    for (const s of list) {
      expect(text).toContain(storyScript(s));
      expect(storyScript(s)).not.toContain(s.head);
    }
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
