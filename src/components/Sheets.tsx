'use client';
import { useEffect, useRef, useState } from 'react';

import { GRADE_LABELS } from '../lib/grading';
import { bulletinMinutes, canSpeak } from '../lib/reader/bulletin';
import { affSec, liked } from '../lib/reader/personalise';
import { isSaved, moveTopic, resetTaste, setMin, toggleTopic } from '../lib/reader/state';
import { track } from '../lib/reader/track';
import type { ClientStory } from '../lib/reader/types';
import { supabaseBrowser } from '../lib/supabase/browser';
import { spreadFor } from '../lib/grading';
import { AuthForm } from './AuthForm';
import { Facts, Grade, Icon, VoiceBadge } from './brand';
import { useReader } from './ReaderContext';
import { SavedList } from './SavedList';

/** Bottom sheet dialog: focus moves in, Escape or the scrim closes, the page behind stays put. */
export function Sheet({ label, children }: { label: string; children: React.ReactNode }) {
  const { closeOverlay, overlay } = useReader();
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const key = JSON.stringify(overlay);

  useEffect(() => {
    opener.current = document.activeElement;
    document.body.classList.add('locked');
    return () => {
      document.body.classList.remove('locked');
      (opener.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.xbtn')?.focus({ preventScroll: true });
    ref.current?.scrollTo({ top: 0 });
  }, [key]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeOverlay();
      if (e.key !== 'Tab' || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>('button,a[href],input,textarea,select,[tabindex="0"]')].filter((x) => !x.hasAttribute('disabled'));
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [closeOverlay]);

  return (
    <>
      <div className="scrim" onClick={closeOverlay} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} ref={ref}>
        <button className="xbtn" onClick={closeOverlay} aria-label="Close"><Icon.close /></button>
        {children}
      </div>
    </>
  );
}

export function StorySheet({ id }: { id: number }) {
  const { ed, st, react, toggleSave, update, closeOverlay } = useReader();
  const live = ed.stories.find((x) => x.id === id);
  const saved = st.saves.find((e) => e.id === id);
  const s: (ClientStory & { secName?: string }) | undefined = live ?? saved?.s;
  if (!s) return null;
  const secName = ed.sections.find((x) => x.id === s.sec)?.name ?? s.secName ?? s.sec;
  const r = st.react[s.id] ?? 0;
  const meters: [string, number][] = [['Corroboration', s.m[0]], ['Primary records', s.m[1]], ['Source spread', spreadFor(s.sources)], ['Stability', s.m[2]]];
  return (
    <Sheet label={s.head}>
      <div className="meta"><Grade grade={s.grade} /><span>{secName} · {s.sub}</span>{live && <VoiceBadge story={s} name={ed.voice?.name} />}</div>
      {!live && saved && <p className="archnote">Saved from the edition of {saved.date}</p>}
      <h2 className="sh-title">{s.head}</h2>
      <p className="stand">{s.stand}</p>
      <h4>Verified facts</h4>
      <Facts story={s} n={8} />
      <div className="body">{s.body.map((p, i) => <p key={i}>{p}</p>)}</div>
      {s.cut.length > 0 && (
        <>
          <h4>What we cut</h4>
          <ul className="cutlist">{s.cut.map(([c, why], i) => <li key={i}><s>{c}</s><span>{why}</span></li>)}</ul>
        </>
      )}
      {s.open.length > 0 && (
        <>
          <h4>Still unclear</h4>
          <ul className="plain">{s.open.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </>
      )}
      <div className="gradebox">
        <div className="gb-head"><Grade grade={s.grade} /><b>Grade {s.grade}: {GRADE_LABELS[s.grade].label}</b><span>{s.score}/100</span></div>
        <p>{GRADE_LABELS[s.grade].note}</p>
        <div className="meters">
          {meters.map(([k, v]) => (
            <div className="meter" key={k}>
              <span>{k} · {v}</span>
              <i role="meter" aria-label={k} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}><b style={{ width: `${v}%` }} /></i>
            </div>
          ))}
        </div>
      </div>
      <h4>The receipts: sources checked</h4>
      <ul className="srcs">
        {s.src.map((x, i) => (
          <li key={i}>
            <a href={x.url} target="_blank" rel="noopener noreferrer" onClick={() => track('source_click', { outlet: x.key }, s.id)}>{x.name}</a>
            {x.note && <em>{x.note}</em>}
            <span>{x.country}</span>
          </li>
        ))}
      </ul>
      {live ? (
        <div className="sh-react">
          <span>Want more like this?</span>
          <button className="rb keep" onClick={() => toggleSave(s)} aria-pressed={isSaved(st, s.id)} aria-label="Save for later"><Icon.keep /></button>
          <button className="rb down" onClick={() => react(s, -1)} aria-pressed={r === -1} aria-label="Less like this"><Icon.cross /></button>
          <button className="rb up" onClick={() => react(s, 1)} aria-pressed={r === 1} aria-label="More like this"><Icon.heart /></button>
        </div>
      ) : (
        <div className="sh-react">
          <span>In your saved list</span>
          <button className="pill" onClick={() => { update((x) => ({ ...x, saves: x.saves.filter((e) => e.id !== s.id) })); closeOverlay(); }}>Remove</button>
        </div>
      )}
    </Sheet>
  );
}

export function RoundupSheet() {
  const { ed, st, bulletin, player, react, openStory, closeOverlay } = useReader();
  const list = liked(st, ed);
  const [speak, setSpeak] = useState(true);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state after hydration
  useEffect(() => setSpeak(canSpeak()), []);
  const voiced = list.length > 0 && list.every((s) => s.clip);
  if (!list.length)
    return (
      <Sheet label="Your roundup">
        <h2 className="sh-title">Your roundup</h2>
        <p className="stand">Your own daily bulletin, built from the stories you like.</p>
        <p className="muted">Tap the heart or swipe right on any story to add it here. Then come back and press play to hear them read out as a short news bulletin.</p>
        <p><button className="pill solid" onClick={closeOverlay}>Find stories</button></p>
      </Sheet>
    );
  const voiceLabel = ed.voice ? `read by an AI version of ${ed.voice.name}'s voice` : 'read aloud by your device';
  const status = !player.playing ? `About ${bulletinMinutes(list, ed)} min · ${voiceLabel}` : player.paused ? 'Paused' : player.story < 0 ? 'Playing' : `Story ${player.story + 1} of ${player.n}`;
  return (
    <Sheet label="Your roundup">
      <h2 className="sh-title">Your roundup</h2>
      <p className="stand">The {list.length} {list.length === 1 ? 'story' : 'stories'} you liked today, as a quick bulletin.</p>
      {speak || voiced ? (
        <div className="player">
          <button className="pill solid" onClick={() => {
            if (!player.playing) track('roundup_play', { n: list.length });
            bulletin?.toggle(list, ed);
          }}>{!player.playing ? 'Play bulletin' : player.paused ? 'Resume' : 'Pause'}</button>
          <button className="pill" onClick={() => bulletin?.next()} disabled={!player.playing}>Next story</button>
          <button className="pill" onClick={() => bulletin?.stop()} disabled={!player.playing}>Stop</button>
          <span className="bstat" aria-live="polite">{status}</span>
        </div>
      ) : (
        <p className="muted">Audio isn&apos;t available in this browser. Try opening the link in Safari or Chrome.</p>
      )}
      <h4>In your roundup</h4>
      <ol className="rlist">
        {list.map((s, i) => (
          <li key={s.id} className={player.playing && player.story === i ? 'now' : ''}>
            <span className="rn">{i + 1}</span>
            <div className="rbody">
              <button className="hl" onClick={() => openStory(s, 'roundup')}>{s.head}</button>
              <small>{ed.sections.find((x) => x.id === s.sec)?.name} · {s.kept.length} facts checked · Grade {s.grade}</small>
              <VoiceBadge story={s} name={ed.voice?.name} />
            </div>
            <button className="rb up" onClick={() => { bulletin?.stop(); react(s, 1); }} aria-pressed="true" aria-label={`Remove from your roundup: ${s.head}`}><Icon.heart /></button>
          </li>
        ))}
      </ol>
      <p className="muted">The bulletin reads each story and its key facts{ed.voice ? `. Voice: ${voiceLabel}` : ''}.</p>
    </Sheet>
  );
}

export function SavedSheet() {
  const { user } = useReader();
  return (
    <Sheet label="Saved for later">
      <h2 className="sh-title">Saved for later</h2>
      <p className="stand">Stories you swiped up on, archived with their full receipts.</p>
      <SavedList />
      <p className="muted">{user ? 'Saved to your account, so they follow you to every device.' : 'Kept on this device. Sign up to keep them on every device.'}</p>
    </Sheet>
  );
}

/** Topics: tap to choose, hold and drag to order (Alt+arrows on a keyboard). */
function TopicOrder() {
  const { ed, st, update, toast } = useReader();
  const listRef = useRef<HTMLOListElement>(null);

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= st.order.length) return;
    const id = st.order[from];
    update((x) => moveTopic(x, from, to));
    toast(`${ed.sections.find((s) => s.id === id)?.name} is now number ${to + 1}`);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-oid="${id}"]`)?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = [...list.children] as HTMLElement[];
    const cleanups = rows.map((row, idx) => {
      let timer: ReturnType<typeof setTimeout> | null = null, drag = false, y0 = 0, x0 = 0, target = idx, h = 0, pid = 0;
      const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
      const start = () => {
        drag = true; h = row.getBoundingClientRect().height + 6;
        row.classList.add('lifted'); list.classList.add('sorting');
        try { row.setPointerCapture(pid); } catch { /* fine */ }
        try { navigator.vibrate?.(12); } catch { /* fine */ }
      };
      const down = (e: PointerEvent) => { if (e.button > 0) return; pid = e.pointerId; y0 = e.clientY; x0 = e.clientX; target = idx; timer = setTimeout(start, e.pointerType === 'mouse' ? 120 : 260); };
      const moveP = (e: PointerEvent) => {
        if (!drag) { if (timer && (Math.abs(e.clientY - y0) > 8 || Math.abs(e.clientX - x0) > 8)) cancel(); return; }
        e.preventDefault();
        const dy = e.clientY - y0;
        row.style.transform = `translateY(${dy}px) scale(1.02)`;
        target = Math.max(0, Math.min(rows.length - 1, idx + Math.round(dy / h)));
        rows.forEach((r, j) => {
          if (r === row) return;
          const shift = idx < target && j > idx && j <= target ? -h : idx > target && j < idx && j >= target ? h : 0;
          r.style.transform = shift ? `translateY(${shift}px)` : '';
        });
      };
      const end = () => {
        cancel(); if (!drag) return; drag = false;
        row.classList.remove('lifted'); list.classList.remove('sorting');
        rows.forEach((r) => (r.style.transform = ''));
        if (target !== idx) move(idx, target);
      };
      const touch = (e: TouchEvent) => { if (drag) e.preventDefault(); };
      const ctx = (e: Event) => { if (drag || timer) e.preventDefault(); };
      row.addEventListener('pointerdown', down);
      row.addEventListener('pointermove', moveP);
      row.addEventListener('pointerup', end);
      row.addEventListener('pointercancel', end);
      row.addEventListener('touchmove', touch, { passive: false });
      row.addEventListener('contextmenu', ctx);
      return () => {
        row.removeEventListener('pointerdown', down);
        row.removeEventListener('pointermove', moveP);
        row.removeEventListener('pointerup', end);
        row.removeEventListener('pointercancel', end);
        row.removeEventListener('touchmove', touch);
        row.removeEventListener('contextmenu', ctx);
      };
    });
    return () => cleanups.forEach((c) => c());
  });

  return (
    <>
      <h4>Pick your topics</h4>
      <div className="tchips">
        {ed.sections.map((s) => {
          const on = st.order.includes(s.id);
          return (
            <button key={s.id} className="tchip" aria-pressed={on} onClick={() => {
              update((x) => toggleTopic(x, s.id));
              toast(on ? `${s.name} removed` : `${s.name} added at number ${st.order.length + 1}`);
            }}>
              {on ? <span className="tick"><Icon.tick /></span> : <span className="plus" aria-hidden="true">+</span>}
              {s.name}
            </button>
          );
        })}
      </div>
      <h4>Your order</h4>
      {st.order.length ? (
        <>
          <ol className="olist" ref={listRef}>
            {st.order.map((id, i) => {
              const s = ed.sections.find((x) => x.id === id);
              if (!s) return null;
              return (
                <li key={id} className={`orow${i < 3 ? ' top3' : ''}`} data-oid={id} tabIndex={0}
                  aria-label={`${i + 1}. ${s.name}. Hold and drag to move, or use Alt and the arrow keys.`}
                  onKeyDown={(e) => {
                    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(i, i + (e.key === 'ArrowUp' ? -1 : 1)); }
                  }}>
                  <span className="num">{i + 1}</span><span className="nm">{s.name}</span>
                  {i < 3 && <span className="otag">Most stories</span>}
                  <span className="grip" aria-hidden="true"><i /><i /><i /></span>
                </li>
              );
            })}
          </ol>
          <p className="muted ohint">Hold a topic, then drag it up or down.</p>
        </>
      ) : <p className="muted">No topics yet. Tap one above.</p>}
    </>
  );
}

export function SettingsSheet() {
  const { ed, st, update, toast, user, signOut, setOverlay, sync } = useReader();
  const learned = ed.sections.map((s) => ({ s, v: affSec(st, s.id) })).filter((x) => x.v !== 0).sort((a, b) => b.v - a.v);
  return (
    <Sheet label="Your edition">
      <h2 className="sh-title">Your edition</h2>
      <p className="stand">Tap the topics you want, then hold and drag to put your favourites first. Your top three get the most stories.</p>
      <TopicOrder />
      <h4>What your swipes have taught us</h4>
      {learned.length ? (
        <>
          <div className="learned">
            {learned.map(({ s, v }) => (
              <div className="lrow" key={s.id}>
                <span>{s.name}</span>
                <i className={v > 0 ? 'pos' : 'neg'}><b style={{ width: `${Math.min(100, Math.abs(v) * 10)}%` }} /></i>
                <em>{v > 0 ? 'More' : 'Less'}</em>
              </div>
            ))}
          </div>
          <button className="pill" onClick={() => { update(resetTaste); toast('Your feed has been reset'); }}>Forget my swipes</button>
        </>
      ) : <p className="muted">Nothing yet. Tap the heart or cross on stories, or swipe, and your feed adjusts.</p>}
      <h4>Lowest grade to show</h4>
      <div className="addrow">
        {([['A', 'A only'], ['B', 'A–B'], ['C', 'A–C'], ['D', 'All grades']] as const).map(([g, t]) => (
          <button key={g} className="pill" aria-pressed={st.min === g} onClick={() => update((x) => setMin(x, g))}>{t}</button>
        ))}
      </div>
      <h4>Your account</h4>
      {user ? (
        <>
          <div className="acctrow"><b>{user.email ?? 'Signed in'}</b><button className="pill" onClick={signOut}>Sign out</button></div>
          <p className="muted">{sync === 'error' ? "Couldn't reach your account just now. Your changes are safe on this device and will sync next time." : 'Your topics, roundup and saves are kept in your account.'}</p>
        </>
      ) : (
        <>
          <p className="muted">Sign up free to keep your roundup, saves and topics on every device.</p>
          <button className="pill solid" onClick={() => setOverlay({ kind: 'account', reason: 'settings' })}>Sign up or sign in</button>
        </>
      )}
      <h4>How the grade works</h4>
      <p className="muted">Each story is rebuilt from the coverage we could check. A fact stays only when sources back it; opinion, spin and loaded words are cut. The grade, A to D, scores how well the finished story is supported: corroboration, primary records, how many outlets, and how settled it is.</p>
      <h4>New here?</h4>
      <p><button className="pill" onClick={() => setOverlay({ kind: 'tour' })}>Replay the welcome tour</button></p>
      <p className="muted"><a href="/privacy">Privacy</a> · Edition No. {ed.issue}, compiled {new Date(ed.compiled).toString() === 'Invalid Date' ? ed.compiled : new Date(ed.compiled).toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</p>
    </Sheet>
  );
}

export function AccountSheet({ reason }: { reason?: string }) {
  const { user, closeOverlay } = useReader();
  useEffect(() => {
    if (user) closeOverlay();
  }, [user, closeOverlay]);
  return (
    <Sheet label="Sign up or sign in">
      <h2 className="sh-title">Keep your receipts</h2>
      <p className="stand">Sign up free. Your roundup, saves and topics follow you to every device.</p>
      <AuthForm from={reason ?? 'sheet'} />
    </Sheet>
  );
}

export const hasAuth = () => !!supabaseBrowser();
