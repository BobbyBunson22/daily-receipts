'use client';
/**
 * Holds the reader's state for the whole app: the edition, their choices (kept in
 * this browser and, when signed in, in their account), what's open, and the toast.
 */
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { Bulletin, type PlayerState } from '../lib/reader/bulletin';
import { deckList, liked, visible } from '../lib/reader/personalise';
import * as S from '../lib/reader/state';
import { merge, pull, push } from '../lib/reader/sync';
import { getAnonId, setTrackingEdition, track } from '../lib/reader/track';
import type { ClientEdition, ClientStory, ReaderState, SwipeAction } from '../lib/reader/types';
import { supabaseBrowser } from '../lib/supabase/browser';

export type Overlay =
  | { kind: 'story'; id: number; back?: Overlay }
  | { kind: 'roundup' }
  | { kind: 'saved' }
  | { kind: 'settings' }
  | { kind: 'account'; reason?: string }
  | { kind: 'tour' }
  | { kind: 'install' }
  | { kind: 'puzzles' }
  | { kind: 'game'; game: 'cw' | 'su' | 'rb' | 'sr' }
  | null;

type SyncStatus = 'off' | 'syncing' | 'saved' | 'error';

interface Ctx {
  ed: ClientEdition;
  st: ReaderState;
  ready: boolean;
  user: { id: string; email: string | null } | null;
  sync: SyncStatus;
  overlay: Overlay;
  setOverlay: (o: Overlay) => void;
  closeOverlay: () => void;
  openStory: (s: ClientStory, from?: string) => void;
  update: (fn: (st: ReaderState) => ReaderState) => void;
  swipe: (s: ClientStory, action: SwipeAction) => void;
  react: (s: ClientStory, v: 1 | -1) => void;
  toggleSave: (s: ClientStory) => void;
  undo: () => void;
  restart: () => void;
  toast: (msg: string) => void;
  toastMsg: string;
  player: PlayerState;
  bulletin: Bulletin | null;
  signOut: () => Promise<void>;
}

const ReaderCtx = createContext<Ctx | null>(null);

export function useReader(): Ctx {
  const c = useContext(ReaderCtx);
  if (!c) throw new Error('useReader outside ReaderProvider');
  return c;
}

const londonDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

function readStored(ed: ClientEdition): ReaderState {
  try {
    return S.normalise(JSON.parse(localStorage.getItem(S.STORAGE_KEY) ?? 'null'), ed);
  } catch {
    return S.initialState(ed);
  }
}

export function ReaderProvider({ ed, children }: { ed: ClientEdition; children: React.ReactNode }) {
  const [st, setSt] = useState<ReaderState>(() => S.initialState(ed));
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<Ctx['user']>(null);
  const [sync, setSync] = useState<SyncStatus>('off');
  const [overlay, setOverlayRaw] = useState<Overlay>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [player, setPlayer] = useState<PlayerState>({ playing: false, paused: false, story: -1, n: 0 });
  const bulletinRef = useRef<Bulletin | null>(null);
  const [bulletin, setBulletin] = useState<Bulletin | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stRef = useRef(st);
  const userRef = useRef(user);
  const pushing = useRef<Promise<void>>(Promise.resolve());
  const dirtyFromUser = useRef(false);
  useEffect(() => {
    stRef.current = st;
    userRef.current = user;
  }, [st, user]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 1800);
  }, []);

  // ---- load from this browser, count the visit
  useEffect(() => {
    setTrackingEdition(ed.id);
    const now = new Date();
    const loaded = S.touchStreak(readStored(ed), londonDay(now), londonDay(new Date(now.getTime() - 864e5)));
    stRef.current = loaded;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state after hydration
    setSt(loaded);
    setReady(true);
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    track('open', { mode: loaded.mode, standalone, w: innerWidth, h: innerHeight });
    bulletinRef.current = new Bulletin((p, event) => {
      setPlayer(p);
      if (event === 'done') {
        toast("That's your roundup");
        track('roundup_done', { n: p.n });
      }
      if (event === 'error') toast('Audio stopped. Tap play to try again');
    });
    setBulletin(bulletinRef.current);
    return () => bulletinRef.current?.stop();
  }, [ed, toast]);

  // ---- save to this browser on every change, and to the account shortly after
  const schedulePush = useCallback(() => {
    const db = supabaseBrowser();
    const u = userRef.current;
    if (!db || !u || ed.id === null) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    setSync('syncing');
    pushTimer.current = setTimeout(() => {
      pushing.current = pushing.current
        .then(() => push(db, u.id, stRef.current, ed))
        .then(() => setSync('saved'))
        .catch(() => setSync('error'));
    }, 1200);
  }, [ed]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(S.STORAGE_KEY, JSON.stringify(st));
    } catch {
      // private mode: state still works for this visit
    }
    if (dirtyFromUser.current) {
      dirtyFromUser.current = false;
      schedulePush();
    }
  }, [st, ready, schedulePush]);

  const update = useCallback((fn: (s: ReaderState) => ReaderState) => {
    dirtyFromUser.current = true;
    const next = fn(stRef.current);
    stRef.current = next;
    setSt(next);
  }, []);

  // ---- account: pick up the session, merge with the account, keep in step
  useEffect(() => {
    const db = supabaseBrowser();
    if (!db || !ready) return;
    let cancelled = false;
    const adopt = async (session: Session | null, isNewSignIn: boolean) => {
      const u = session?.user;
      if (!u) {
        setUser(null);
        setSync('off');
        return;
      }
      setUser({ id: u.id, email: u.email ?? null });
      if (ed.id === null) return;
      setSync('syncing');
      try {
        if (isNewSignIn) {
          await db.rpc('dr_claim_device', { p_anon_id: getAnonId() });
          track('signin', { provider: u.app_metadata?.provider ?? 'email' });
        }
        const remote = await pull(db, u.id, ed);
        if (cancelled) return;
        const merged = merge(stRef.current, remote, ed);
        stRef.current = merged;
        setSt(merged);
        await push(db, u.id, merged, ed);
        setSync('saved');
      } catch {
        setSync('error');
      }
    };
    db.auth.getSession().then(({ data }) => adopt(data.session, false));
    const { data: sub } = db.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.id !== userRef.current?.id) void adopt(session, true);
      if (event === 'SIGNED_OUT') void adopt(null, false);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [ready, ed]);

  const signOut = useCallback(async () => {
    const db = supabaseBrowser();
    track('signout');
    await db?.auth.signOut();
    setUser(null);
    setSync('off');
    toast('Signed out. Your choices stay on this device');
  }, [toast]);

  // ---- overlays
  const setOverlay = useCallback((o: Overlay) => {
    if (o?.kind !== 'roundup' && o?.kind !== 'story') bulletinRef.current?.stop();
    setOverlayRaw(o);
    if (o?.kind === 'roundup') track('roundup_open', { n: liked(stRef.current, ed).length });
    if (o?.kind === 'settings') track('settings');
  }, [ed]);

  const closeOverlay = useCallback(() => {
    setOverlayRaw((o) => {
      if (o?.kind === 'roundup') bulletinRef.current?.stop();
      if (o?.kind === 'story' && o.back) return o.back;
      if (o?.kind === 'game') return { kind: 'puzzles' };
      return null;
    });
  }, []);

  const openStory = useCallback((s: ClientStory, from = 'card') => {
    setOverlayRaw((o) => {
      const back = o?.kind === 'roundup' || o?.kind === 'saved' ? o : undefined;
      if (o?.kind === 'roundup') bulletinRef.current?.stop();
      return { kind: 'story', id: s.id, back };
    });
    track('story_open', { from }, s.id);
  }, []);

  // ---- reader actions
  const swipe = useCallback((s: ClientStory, action: SwipeAction) => {
    const before = stRef.current;
    const after = S.swipe(before, s, action, ed, Date.now());
    update(() => after);
    track('swipe', { action, grade: s.grade, sec: s.sec, pos: before.swiped.length + 1 }, s.id);
    if (action === 'later') toast(`Saved for later · ${after.saves.length} in your list`);
    else if (action === 'more') toast('Added to your roundup');
    else toast(`Less ${ed.sections.find((x) => x.id === s.sec)?.name ?? s.sec} from now on`);
    if (action === 'later') track('save', { from: 'swipe' }, s.id);
    if (visible(after, ed).length && !deckList(after, ed).length) track('deck_done', { likes: liked(after, ed).length, n: after.swiped.length });
  }, [ed, toast, update]);

  const react = useCallback((s: ClientStory, v: 1 | -1) => {
    const prev = stRef.current.react[s.id] ?? 0;
    update((x) => S.react(x, s, v, true));
    const now = prev === v ? 0 : v;
    if (now === 1) toast('Added to your roundup');
    else if (now === -1) toast(`Less ${ed.sections.find((x) => x.id === s.sec)?.name ?? s.sec} from now on`);
    else toast(v === 1 ? 'Removed from your roundup' : 'Skip undone');
    track('swipe', { action: now === 1 ? 'more' : now === -1 ? 'less' : 'clear', via: 'button', grade: s.grade, sec: s.sec }, s.id);
  }, [ed, toast, update]);

  const toggleSave = useCallback((s: ClientStory) => {
    if (S.isSaved(stRef.current, s.id)) {
      update((x) => S.removeSave(x, s.id));
      toast('Removed from saved for later');
      track('unsave', {}, s.id);
    } else {
      update((x) => S.addSave(x, s, ed, Date.now()));
      toast('Saved for later');
      track('save', { from: 'button' }, s.id);
    }
  }, [ed, toast, update]);

  const undo = useCallback(() => {
    const { state, story } = S.undo(stRef.current, ed);
    if (!story) return;
    update(() => state);
    toast('Brought it back');
  }, [ed, toast, update]);

  const restart = useCallback(() => {
    update(S.restart);
    toast('Back to story 1. Your likes and saves are kept');
    track('restart');
  }, [toast, update]);

  const value = useMemo<Ctx>(() => ({
    ed, st, ready, user, sync, overlay, setOverlay, closeOverlay, openStory, update, swipe, react, toggleSave,
    undo, restart, toast, toastMsg, player, bulletin, signOut,
  }), [ed, st, ready, user, sync, overlay, setOverlay, closeOverlay, openStory, update, swipe, react, toggleSave, undo, restart, toast, toastMsg, player, bulletin, signOut]);

  return <ReaderCtx.Provider value={value}>{children}</ReaderCtx.Provider>;
}
