/**
 * Keeps a signed-in reader's state in their account, so it follows them between devices.
 * The browser copy stays the working copy; the account is updated shortly after each change.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { GradeLetter } from '../../types/edition';
import { normalise } from './state';
import type { ClientEdition, Mode, ReaderState, SavedEntry, DeckSize, VoiceChoice } from './types';

export interface Remote {
  profile: { topic_order: string[]; min_grade: GradeLetter; mode: Mode; deck_size?: DeckSize | null; voice?: VoiceChoice | null; display_name?: string | null; username?: string | null } | null;
  taste: { key: string; score: number }[];
  reactions: { story_id: number; value: 1 | -1 }[];
  swipes: { story_id: number; action: 'more' | 'less' | 'later'; created_at: string }[];
  saves: { story_id: number | null; snapshot: SavedEntry; created_at: string }[];
}

/**
 * Combines this browser's state with the account's.
 * Settings: the account wins if it has any (it's the reader's chosen setup).
 * Taste: the account's value for each key, plus anything only this browser has.
 * Likes, swipes, saves: everything from both.
 */
export function merge(local: ReaderState, remote: Remote, ed: ClientEdition): ReaderState {
  const hasProfile = !!remote.profile && remote.profile.topic_order.length > 0;
  const tasteSec = { ...local.taste.sec };
  const tasteSub = { ...local.taste.sub };
  const tasteTag = { ...local.taste.tag };
  for (const t of remote.taste) {
    if (t.key.startsWith('sec:')) tasteSec[t.key.slice(4)] = t.score;
    else if (t.key.startsWith('sub:')) tasteSub[t.key.slice(4)] = t.score;
    else if (t.key.startsWith('tag:')) tasteTag[t.key.slice(4)] = t.score;
  }
  const react = { ...local.react };
  for (const r of remote.reactions) react[r.story_id] = r.value;
  const swiped = local.swiped.slice();
  for (const s of remote.swipes.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)))
    if (!swiped.includes(s.story_id)) swiped.push(s.story_id);
  const saves = local.saves.slice();
  for (const s of remote.saves) {
    const e = s.snapshot;
    if (e && typeof e.id === 'number' && !saves.some((x) => x.id === e.id)) saves.push(e);
  }
  return normalise(
    {
      ...local,
      order: hasProfile ? remote.profile!.topic_order : local.order,
      min: hasProfile ? remote.profile!.min_grade : local.min,
      mode: hasProfile ? remote.profile!.mode : local.mode,
      size: hasProfile && remote.profile!.deck_size ? remote.profile!.deck_size : local.size,
      // a secured username is the reader's name everywhere; the account says whether there is one
      name: remote.profile?.username || (hasProfile && remote.profile!.display_name ? remote.profile!.display_name : local.name),
      secured: remote.profile?.username ?? '',
      // the account's choice wins only if it's a real pick (the account default is 'both')
      ...(hasProfile && remote.profile!.voice && remote.profile!.voice !== 'both' && !local.voicePicked
        ? { voice: remote.profile!.voice, voicePicked: true }
        : { voice: local.voice, voicePicked: local.voicePicked }),
      taste: { sec: tasteSec, sub: tasteSub, tag: tasteTag },
      react,
      swiped,
      saves,
    },
    ed,
  );
}

export async function pull(db: SupabaseClient, uid: string, ed: ClientEdition): Promise<Remote> {
  const ids = ed.stories.map((s) => s.id);
  const [profile, taste, reactions, swipes, saves] = await Promise.all([
    db.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
    db.from('taste').select('key, score').eq('user_id', uid),
    db.from('reactions').select('story_id, value').eq('user_id', uid).in('story_id', ids),
    ed.id === null ? Promise.resolve({ data: [], error: null }) : db.from('swipes').select('story_id, action, created_at').eq('user_id', uid).eq('edition_id', ed.id),
    db.from('saves').select('story_id, snapshot, created_at').eq('user_id', uid),
  ]);
  const err = profile.error ?? taste.error ?? reactions.error ?? swipes.error ?? saves.error;
  if (err) throw new Error(err.message);
  return {
    profile: profile.data as Remote['profile'],
    taste: (taste.data ?? []) as Remote['taste'],
    reactions: (reactions.data ?? []) as Remote['reactions'],
    swipes: (swipes.data ?? []) as Remote['swipes'],
    saves: (saves.data ?? []) as Remote['saves'],
  };
}

const inList = (ids: number[]) => `(${ids.join(',')})`;

/** Writes the whole state for this edition to the account. Small, so simplest is safest. */
export async function push(db: SupabaseClient, uid: string, st: ReaderState, ed: ClientEdition): Promise<void> {
  if (ed.id === null) return;
  const editionIds = ed.stories.map((s) => s.id);
  const reacted = Object.entries(st.react).map(([id, value]) => ({ user_id: uid, story_id: Number(id), value }));
  const tasteRows = [
    ...Object.entries(st.taste.sec).map(([k, score]) => ({ user_id: uid, key: `sec:${k}`, score })),
    ...Object.entries(st.taste.sub).map(([k, score]) => ({ user_id: uid, key: `sub:${k}`, score })),
    ...Object.entries(st.taste.tag).filter(([k]) => k.length <= 70).map(([k, score]) => ({ user_id: uid, key: `tag:${k}`, score: Math.round(score) })),
  ];
  const actionOf = (id: number) => (st.react[id] === 1 ? 'more' : st.react[id] === -1 ? 'less' : 'later');
  const swipeRows = st.swiped.map((id) => ({ user_id: uid, edition_id: ed.id!, story_id: id, action: actionOf(id) }));
  const saveRows = st.saves.map((e) => ({ user_id: uid, story_id: e.id, snapshot: e }));

  const results = await Promise.all([
    db.from('profiles').upsert({ user_id: uid, topic_order: st.order, min_grade: st.min, mode: st.mode, deck_size: st.size, voice: st.voice, display_name: st.name || null, updated_at: new Date().toISOString() }),
    tasteRows.length ? db.from('taste').upsert(tasteRows) : db.from('taste').delete().eq('user_id', uid),
    (async () => {
      const unreacted = editionIds.filter((id) => !(id in st.react));
      if (unreacted.length) {
        const r = await db.from('reactions').delete().eq('user_id', uid).in('story_id', unreacted);
        if (r.error) return r;
      }
      return reacted.length ? db.from('reactions').upsert(reacted) : { error: null };
    })(),
    (async () => {
      const r = await db.from('swipes').delete().eq('user_id', uid).eq('edition_id', ed.id!).not('story_id', 'in', inList(st.swiped.length ? st.swiped : [0]));
      if (r.error) return r;
      return swipeRows.length ? db.from('swipes').upsert(swipeRows, { onConflict: 'user_id,story_id' }) : { error: null };
    })(),
    (async () => {
      const keep = st.saves.map((e) => e.id);
      const r = await db.from('saves').delete().eq('user_id', uid).not('story_id', 'in', inList(keep.length ? keep : [0]));
      if (r.error) return r;
      return saveRows.length ? db.from('saves').upsert(saveRows, { onConflict: 'user_id,story_id' }) : { error: null };
    })(),
  ]);
  const err = results.find((r) => r && 'error' in r && r.error);
  if (err && err.error) throw new Error(err.error.message);
}
