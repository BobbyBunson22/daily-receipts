'use client';
import { outboundUrl } from '../lib/reader/outbound';
import { useEffect, useRef, useState } from 'react';

import { GRADE_LABELS } from '../lib/grading';
import { bulletinMinutes, canSpeak } from '../lib/reader/bulletin';
import { liked } from '../lib/reader/personalise';
import { tagKey } from '../lib/reader/tags';
import { NAME_MAX, brandFor, cleanName, roundupFor } from '../lib/reader/name';
import { forgetTag, isSaved, moveTopic, resetTaste, setMin, setName, setSize, setVoice, toggleTopic } from '../lib/reader/state';
import { READER_IDS, READERS, choiceName, openingUrl, partUrl, readerFor } from '../lib/reader/voices';
import { track } from '../lib/reader/track';
import type { ClientStory, Reader, VoiceChoice } from '../lib/reader/types';
import { supabaseBrowser } from '../lib/supabase/browser';
import { spreadFor } from '../lib/grading';
import { AuthForm } from './AuthForm';
import { Facts, Grade, Icon, VoiceBadge } from './brand';
import { useReader } from './ReaderContext';
import { PuzzleSettings } from './Puzzles';
import { SavedList } from './SavedList';
import { ShareButton } from './Share';
import { claim, why } from './Claim';
import { GoldToken } from './Daily';
import { SaveAudioButton, ShareRoundupButton } from './RoundupShare';

/** Bottom sheet dialog: focus moves in, Escape or the scrim closes, the page behind stays put. */
/** Other outlets' coverage of the story, for further reading. Not sources, not graded. */
export function AlsoReported({ story, compact }: { story: ClientStory; compact?: boolean }) {
  const also = story.also ?? [];
  if (!also.length) return null;
  const links = also.map((a) => (
    <a key={a.key} className="alink" href={outboundUrl(a.url)} target="_blank" rel="noopener"
      onClick={() => track('source_click', { outlet: a.key, kind: 'also' }, story.id)}>
      {a.name}<span aria-hidden="true"> ↗</span><span className="sr-only"> (opens their article)</span>
    </a>
  ));
  if (compact) return <p className="also compact"><span className="also-k">Also reported by</span>{links}</p>;
  return (
    <>
      <h4>Also reported by</h4>
      <p className="also">{links}</p>
      <p className="muted also-note">Their coverage, if you want to read further. We didn&apos;t take facts from these, and they don&apos;t count towards the grade.</p>
    </>
  );
}

export function Sheet({ label, children, tall = false }: { label: string; children: React.ReactNode; tall?: boolean }) {
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
      <div className={`sheet${tall ? ' tall' : ''}`} role="dialog" aria-modal="true" aria-label={label} ref={ref}>
        <button className="xbtn" onClick={closeOverlay} aria-label="Close"><Icon.close /></button>
        {children}
      </div>
    </>
  );
}

export function StorySheet({ id }: { id: number }) {
  const { ed, st, react, toggleSave, update, closeOverlay, shared } = useReader();
  const live = ed.stories.find((x) => x.id === id);
  const saved = st.saves.find((e) => e.id === id);
  const fromLink = !live && shared?.story.id === id ? shared : null;
  const s: (ClientStory & { secName?: string }) | undefined = live ?? saved?.s ?? fromLink?.story;
  if (!s) return null;
  const secName = ed.sections.find((x) => x.id === s.sec)?.name ?? s.secName ?? s.sec;
  const r = st.react[s.id] ?? 0;
  const meters: [string, number][] = [['Corroboration', s.m[0]], ['Primary records', s.m[1]], ['Source spread', spreadFor(s.sources)], ['Stability', s.m[2]]];
  return (
    <Sheet label={s.head}>
      <div className="meta"><Grade grade={s.grade} /><span>{secName} · {s.sub}</span>{live && <VoiceBadge story={s} name={ed.voice?.name} reader={st.voice === 'both' ? undefined : st.voice} />}</div>
      {!live && saved && <p className="archnote">Saved from the edition of {saved.date}</p>}
      {!live && !saved && fromLink && <p className="archnote">From the edition of {fromLink.date}</p>}
      <h2 className="sh-title">{s.head}</h2>
      <p className="stand">{s.stand}</p>
      <div className="sharerow">
        <ShareButton s={s} from="story" className="pill" label="Share this receipt" />
        <small>Grade {s.grade} · {s.kept.length} facts checked</small>
      </div>
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
            <a href={outboundUrl(x.url)} target="_blank" rel="noopener" onClick={() => track('source_click', { outlet: x.key, kind: 'receipt' }, s.id)}>{x.name}</a>
            {x.note && <em>{x.note}</em>}
            <span>{x.country}</span>
          </li>
        ))}
      </ul>
      <AlsoReported story={s} />
      {live ? (
        <div className="sh-react">
          <span>Want more like this?</span>
          <button className="rb keep" onClick={() => toggleSave(s)} aria-pressed={isSaved(st, s.id)} aria-label="Save for later"><Icon.keep /></button>
          <button className="rb down" onClick={() => react(s, -1)} aria-pressed={r === -1} aria-label="Less like this"><Icon.cross /></button>
          <button className="rb up" onClick={() => react(s, 1)} aria-pressed={r === 1} aria-label="More like this"><Icon.heart /></button>
        </div>
      ) : fromLink && !saved ? (
        <div className="sh-react">
          <span>That was one story. There are {ed.stories.length} in today&apos;s edition.</span>
          <button className="pill solid" onClick={closeOverlay}>Read today&apos;s news</button>
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

/** Choose who reads the roundup (one newsreader, or both taking turns), with a short sample of each. */
export function NewsreaderPicker() {
  const { ed, st, update, bulletin, toast } = useReader();
  const [playing, setPlaying] = useState<VoiceChoice | null>(null);
  const hear = async (v: VoiceChoice) => {
    // one reader: their sample; both: the two-handed hello
    const clips = v === 'both' ? [openingUrl(ed)] : [partUrl(ed, v, 'sample')];
    setPlaying(v);
    track('voice_sample', { reader: v });
    let ok = !!bulletin;
    for (const src of clips) if (ok) ok = !!src && (await bulletin!.sample(src));
    setPlaying(null);
    if (!ok) toast(canSpeak() ? `${choiceName(v)}'s sample isn't ready yet` : "Audio isn't available in this browser");
  };
  const options: [VoiceChoice, string][] = [...READER_IDS.map((r): [VoiceChoice, string] => [r, READERS[r].about]), ['both', 'Taking turns']];
  return (
    <div className="readers" role="radiogroup" aria-label="Newsreader">
      {options.map(([v, about]) => (
        <div key={v} className={`reader${st.voice === v ? ' on' : ''}`}>
          <button role="radio" aria-checked={st.voice === v} className="pill" onClick={() => {
            if (st.voice === v) return;
            bulletin?.stop();
            update((x) => setVoice(x, v));
            track('voice_pick', { reader: v });
            toast(v === 'both' ? 'George and Emma will take turns' : `${READERS[v].name} will read your roundup`);
          }}>{v === 'both' ? 'Both' : READERS[v].name}<small>{about}</small></button>
          <button className="pill hear" onClick={() => hear(v)} disabled={playing !== null} aria-label={`Hear ${choiceName(v)}`}>
            <Icon.mic /> {playing === v ? 'Playing' : 'Hear'}
          </button>
        </div>
      ))}
    </div>
  );
}

export function RoundupSheet() {
  const { ed, st, bulletin, player, react, openStory, closeOverlay, toast, setOverlay } = useReader();
  const list = liked(st, ed);
  const [speak, setSpeak] = useState(true);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state after hydration
  useEffect(() => setSpeak(canSpeak()), []);
  const by = (i: number) => readerFor(st.voice, i, ed);
  const voiced = list.length > 0 && list.every((s, i) => s.clip || s.voices?.[by(i)]);
  const someVoiced = list.some((s, i) => s.voices?.[by(i)]);
  if (!list.length)
    return (
      <Sheet label="Your roundup">
        <h2 className="sh-title">{roundupFor(st.name)}</h2>
        <p className="stand">Your own daily bulletin, built from the stories you like.</p>
        <p className="muted">Tap the heart or swipe right on any story to add it here. Then come back and press play to hear them read out as a short news bulletin.</p>
        <p><button className="pill solid" onClick={closeOverlay}>Find stories</button></p>
      </Sheet>
    );
  const name = choiceName(st.voice);
  const voiceLabel = someVoiced ? `read by ${name}, AI ${st.voice === 'both' ? 'voices' : 'voice'}` : ed.voice ? `read by an AI version of ${ed.voice.name}'s voice` : 'read aloud by your device';
  const status = !player.playing ? `About ${bulletinMinutes(list, ed, st.voice)} min · ${voiceLabel}` : player.paused ? 'Paused' : player.story < 0 ? 'Playing' : `Story ${player.story + 1} of ${player.n}`;
  return (
    <Sheet label="Your roundup">
      <h2 className="sh-title">{roundupFor(st.name)}</h2>
      <p className="stand">The {list.length} {list.length === 1 ? 'story' : 'stories'} you liked today, read in full as your own news bulletin.</p>
      {speak || voiced ? (
        <div className="player">
          <button className="pill solid" onClick={() => {
            if (!player.playing) track('roundup_play', { n: list.length });
            bulletin?.toggle(list, ed, st.voice);
          }}>{!player.playing ? 'Play bulletin' : player.paused ? 'Resume' : 'Pause'}</button>
          <button className="pill" onClick={() => bulletin?.next()} disabled={!player.playing}>Next story</button>
          <button className="pill" onClick={() => bulletin?.stop()} disabled={!player.playing}>Stop</button>
          <span className="bstat" aria-live="polite">{status}</span>
        </div>
      ) : (
        <p className="muted">Audio isn&apos;t available in this browser. Try opening the link in Safari or Chrome.</p>
      )}
      <div className="rshare-row">
        <ShareRoundupButton list={list} ed={ed} voice={st.voice} name={st.name} toast={toast} />
        <SaveAudioButton list={list} ed={ed} voice={st.voice} name={st.name} bulletin={bulletin} toast={toast} from="roundup" />
      </div>
      {!st.name && <p className="muted">Add a username in <button className="linkish" onClick={() => setOverlay({ kind: 'settings' })}>settings</button> and it&apos;s shared as your roundup, by name.</p>}
      {player.playing && (player.cached ?? 0) >= 1 && <p className="muted">Your roundup is on your phone now: it keeps playing without signal.</p>}
      <h4>Your newsreader</h4>
      <NewsreaderPicker />
      <h4>In your roundup</h4>
      <ol className="rlist">
        {list.map((s, i) => (
          <li key={s.id} className={player.playing && player.story === i ? 'now' : ''}>
            <span className="rn">{i + 1}</span>
            <div className="rbody">
              <button className="hl" onClick={() => openStory(s, 'roundup')}>{s.head}</button>
              <small>{ed.sections.find((x) => x.id === s.sec)?.name} · {s.kept.length} facts checked · Grade {s.grade}</small>
              <VoiceBadge story={s} name={ed.voice?.name} reader={by(i)} />
            </div>
            <button className="rb up" onClick={() => { bulletin?.stop(); react(s, 1); }} aria-pressed="true" aria-label={`Remove from your roundup: ${s.head}`}><Icon.heart /></button>
          </li>
        ))}
      </ol>
      <p className="muted">
        {st.voice === 'both' ? `${name} take turns, story by story, reading each one in full: the headline, then the report.` : `${name} reads each story in full: the headline, then the report.`}{' '}
        {READERS.george.name} and {READERS.emma.name} are AI voices (Kokoro, open source), not real people.
        {list.some((s, i) => !s.voices?.[by(i)]) ? ' Stories not recorded yet are read by your device\u2019s voice.' : ''}
      </p>
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

/** The reader's username: "jay" makes it Jay’s Receipts. Once secured, changes go to the account. */
function NameField() {
  const { st, user, update, toast, setOverlay } = useReader();
  const [draft, setDraft] = useState(st.name);
  const [busy, setBusy] = useState(false);
  const clean = cleanName(draft);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clean === st.name) return;
    if (st.secured && user) {
      // a secured name can change, but the new one must be free too
      setBusy(true);
      const r = await claim(clean);
      setBusy(false);
      if (!r.ok) return toast(why(r.reason));
      update((x) => ({ ...setName(x, r.name), secured: r.name }));
      return toast(`You're now ${brandFor(r.name)}`);
    }
    update((x) => setName(x, clean));
    track('settings', { name: clean ? 'set' : 'cleared' });
    toast(clean ? `Welcome to ${brandFor(clean)}` : 'Back to Daily Receipts');
  };
  return (
    <form className="namefield" onSubmit={save}>
      <label htmlFor="dr-name">Shows as <b>{brandFor(clean)}</b> and <b>{roundupFor(clean)}</b>.</label>
      <div className="namerow">
        <input id="dr-name" type="text" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={NAME_MAX + 10}
          placeholder="e.g. jay" autoComplete="nickname" autoCapitalize="words" spellCheck={false} enterKeyHint="done" />
        <button className="pill solid" type="submit" disabled={clean === st.name || busy || (!!st.secured && !clean)}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {st.secured ? (
        <p className="namestate ok"><GoldToken size={16} /> Secured to your account: nobody else can be {brandFor(st.secured)}.</p>
      ) : (
        <p className="namestate">
          Not secured yet. <button type="button" className="linkish" onClick={() => setOverlay({ kind: 'claim' })}>Secure it free and win 5 gold DR tokens</button>
        </p>
      )}
    </form>
  );
}

export function SettingsSheet() {
  const { ed, st, update, toast, user, signOut, setOverlay, sync } = useReader();
  const names = new Map<string, string>();
  for (const s of ed.stories) for (const t of s.tags ?? []) if (!names.has(tagKey(t))) names.set(tagKey(t), t);
  const nameOf = (k: string) => names.get(k) ?? k.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  const learned = Object.entries(st.taste.tag).filter(([, v]) => v !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || b[1] - a[1]).slice(0, 12)
    .map(([k, v]) => ({ k, v, name: nameOf(k) })).sort((a, b) => b.v - a.v);
  return (
    <Sheet label="Your edition">
      <h2 className="sh-title">Your edition</h2>
      <h4>Your username</h4>
      <NameField />
      <h4>Your topics</h4>
      <p className="stand">Tap the topics you want, then hold and drag to put your favourites first. Your top three get the most stories.</p>
      <TopicOrder />
      <h4>Number of receipts</h4>
      <div className="addrow" role="group" aria-label="Number of receipts">
        {([['quick', 'Quick', 18], ['standard', 'Standard', 36], ['long', 'Long', 54]] as const).map(([k, t, n]) => (
          <button key={k} className="pill" aria-pressed={st.size === k} onClick={() => update((x) => setSize(x, k))}>{t} · {n}</button>
        ))}
      </div>
      <p className="muted">How many stories in your daily deck, from your topics in your order. Want more on the day? Tap &ldquo;Maximum receipts&rdquo; at the end.</p>
      <h4>Your newsreader</h4>
      <NewsreaderPicker />
      <p className="muted">Who reads your roundup: George, Emma, or both taking turns. Both are AI voices; tap Hear for a sample.</p>
      <h4>What your swipes have taught us</h4>
      {learned.length ? (
        <>
          <div className="learned">
            {learned.map(({ k, v, name }) => (
              <div className="lrow" key={k}>
                <span>{name}</span>
                <i className={v > 0 ? 'pos' : 'neg'}><b style={{ width: `${Math.min(100, Math.abs(v) * 10)}%` }} /></i>
                <em>{v > 0 ? 'More' : 'Less'}</em>
                <button className="lx" onClick={() => update((x) => forgetTag(x, k))} aria-label={`Forget ${name}`}>×</button>
              </div>
            ))}
          </div>
          <button className="pill" onClick={() => { update(resetTaste); toast('Your feed has been reset'); }}>Forget my swipes</button>
        </>
      ) : <p className="muted">Nothing yet. Swipe right on stories you want more like, left on ones you don&apos;t: we learn the people, places and subjects, not just the section.</p>}
      <h4>Daily puzzles</h4>
      <PuzzleSettings />
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
          <p className="muted">Sign up free and win 10 gold DR tokens. Your roundup, saves and topics follow you to every device.</p>
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
      <p className="stand">Sign up free and win <b>10 gold DR tokens</b>. Your roundup, saves and topics follow you to every device.</p>
      <AuthForm from={reason ?? 'sheet'} />
    </Sheet>
  );
}

export const hasAuth = () => !!supabaseBrowser();
