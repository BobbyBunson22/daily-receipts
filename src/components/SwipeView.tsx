'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';

import { deckList, extraCount, leans, liked, minutes, todays } from '../lib/reader/personalise';
import { brandFor } from '../lib/reader/name';
import { reswipeSaved, showMax } from '../lib/reader/state';
import type { ClientStory, SwipeAction } from '../lib/reader/types';
import { Facts, Grade, Icon, Logo, VoiceBadge, cutLabel, mastDate, shortDate } from './brand';
import { DailyBadge } from './Daily';
import { EndExtras } from './EndExtras';
import { InstallButton } from './Install';
import { usePuzzles } from './Puzzles';
import { useReader } from './ReaderContext';
import { ShareButton } from './Share';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Make every headline show in full: shrink it, then drop the standfirst, then trim facts. */
function fitCards(root: HTMLElement | null) {
  root?.querySelectorAll<HTMLElement>('.card').forEach((c) => {
    const cin = c.querySelector<HTMLElement>('.cin');
    const h = c.querySelector<HTMLElement>('h3');
    if (!cin || !h) return;
    h.style.fontSize = '';
    c.classList.remove('tight');
    const items = [...c.querySelectorAll<HTMLElement>('.facts li')];
    items.forEach((li) => (li.hidden = false));
    const over = () => cin.scrollHeight > cin.clientHeight + 1;
    let size = parseFloat(getComputedStyle(h).fontSize);
    while (over() && size > 18) {
      size -= 1;
      h.style.fontSize = `${size}px`;
    }
    if (over()) c.classList.add('tight');
    let shown = items.length;
    while (over() && shown > 1) items[--shown].hidden = true;
  });
}

function Card({ s, depth, onGesture }: { s: ClientStory; depth: number; onGesture?: (el: HTMLElement) => void }) {
  const { ed } = useReader();
  const sec = ed.sections.find((x) => x.id === s.sec)?.name ?? s.sec;
  const top = depth === 0;
  return (
    <article
      className={`card d${depth}`}
      id={top ? 'topcard' : undefined}
      tabIndex={top ? 0 : undefined}
      aria-hidden={top ? undefined : true}
      aria-label={top ? `${s.head}. Grade ${s.grade}. Swipe right for more like this, left for less, up to save for later. Press Enter for the receipts.` : undefined}
      aria-roledescription={top ? 'story card' : undefined}
      data-id={s.id}
      ref={top && onGesture ? (el) => { if (el) onGesture(el); } : undefined}
    >
      <span className="stamp more" aria-hidden="true">MORE</span>
      <span className="stamp less" aria-hidden="true">LESS</span>
      <span className="stamp save" aria-hidden="true">LATER</span>
      <div className="cin">
        <div className="chead"><Logo /><span>No. {ed.issue} · {shortDate(ed.date)}</span><Grade grade={s.grade} /></div>
        <div className="meta"><span>{sec} · {s.sub}</span><VoiceBadge story={s} name={ed.voice?.name} /></div>
        <h3>{s.head}</h3>
        <p className="cstand">{s.stand}</p>
        <Facts story={s} />
      </div>
      <div className="cardfoot">
        <span>{s.kept.length} checked · <span className={s.cut.length ? 'cutn' : ''}><span className="cl-long">{cutLabel(s)}</span><span className="cl-short" aria-hidden="true">{s.cut.length ? `${s.cut.length} cut` : 'None cut'}</span></span></span>
        <span>Tap for receipts</span>
        {top && <ShareButton s={s} from="card" className="cshare" />}
      </div>
    </article>
  );
}

export function SwipeView() {
  const { ed, st, swipe, undo, restart, openStory, setOverlay, update, overlay } = useReader();
  const { anyOn } = usePuzzles();
  const deckRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const all = todays(st, ed);
  const extra = extraCount(st, ed);
  const deck = deckList(st, ed);
  const done = all.length - deck.length;
  const top = deck[0];
  const nLiked = liked(st, ed).length;

  useLayoutEffect(() => fitCards(deckRef.current));
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => fitCards(deckRef.current), 200);
    };
    addEventListener('resize', onResize);
    document.fonts?.ready.then(() => fitCards(deckRef.current));
    return () => removeEventListener('resize', onResize);
  }, []);

  /** Fly the top card off, then record the swipe. */
  const commit = (action: SwipeAction) => {
    const el = document.getElementById('topcard');
    if (!el || !top || busy.current) return;
    const finish = () => {
      busy.current = false;
      swipe(top, action);
      requestAnimationFrame(() => document.getElementById('topcard')?.focus({ preventScroll: true }));
    };
    if (reduced()) return finish();
    busy.current = true;
    el.style.transition = 'transform .28s ease-in, opacity .28s';
    el.style.transform = action === 'later' ? 'translateY(-120%) scale(.9)' : `translateX(${action === 'more' ? 130 : -130}%) rotate(${action === 'more' ? 18 : -18}deg)`;
    el.style.opacity = '0';
    setTimeout(finish, 230);
  };

  // drag to swipe
  const wire = (el: HTMLElement) => {
    if (el.dataset.wired === String(top?.id)) return;
    el.dataset.wired = String(top?.id);
    let x0 = 0, y0 = 0, dx = 0, dy = 0, down = false, t0 = 0;
    const stamp = (k: string) => el.querySelector<HTMLElement>(`.stamp.${k}`)!;
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    el.onpointerdown = (e) => {
      if (busy.current) return;
      if ((e.target as HTMLElement).closest('[data-nodrag]')) return; // the card's own buttons
      down = true; x0 = e.clientX; y0 = e.clientY; dx = dy = 0; t0 = Date.now();
      el.setPointerCapture(e.pointerId);
      el.style.transition = 'none';
    };
    el.onpointermove = (e) => {
      if (!down) return;
      dx = e.clientX - x0; dy = e.clientY - y0;
      const up = dy < 0 && -dy > Math.abs(dx);
      const ty = up ? dy : Math.max(-20, Math.min(20, dy * 0.25));
      el.style.transform = `translate(${dx}px, ${ty}px) rotate(${up ? 0 : dx / 22}deg)`;
      stamp('more').style.opacity = String(up ? 0 : clamp01(dx / 100));
      stamp('less').style.opacity = String(up ? 0 : clamp01(-dx / 100));
      stamp('save').style.opacity = String(up ? clamp01(-dy / 90) : 0);
    };
    const end = () => {
      if (!down) return;
      down = false;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if (dy < -90 && ay > ax) return commit('later');
      if (ax > 100 && ax > ay) return commit(dx > 0 ? 'more' : 'less');
      el.style.transition = 'transform .2s ease';
      el.style.transform = '';
      ['more', 'less', 'save'].forEach((k) => (stamp(k).style.opacity = '0'));
      if (ax < 6 && ay < 6 && Date.now() - t0 < 600 && top) openStory(top, 'card');
    };
    el.onpointerup = end;
    el.onpointercancel = end;
  };

  // arrow keys and Enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlay || !top) return;
      const t = e.target as HTMLElement;
      if (t.matches('input,textarea,select,[contenteditable]')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); commit('more'); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); commit('less'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); commit('later'); }
      else if ((e.key === 'Enter' || e.key === ' ') && t.id === 'topcard') { e.preventDefault(); openStory(top, 'keyboard'); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  if (!all.length) {
    return (
      <div className="deckwrap">
        <div className="rcpt last"><div className="end">
          <h2>Nothing here yet</h2>
          <p>Add topics or widen the grade filter.</p>
          <div className="endbtns"><button className="pill" onClick={() => setOverlay({ kind: 'settings' })}>Your topics</button></div>
        </div></div>
      </div>
    );
  }

  if (!deck.length) {
    const ln = leans(st, ed);
    return (
      <div className="deckwrap">
        <div className="rcpt last">
          <div className="end">
            <Logo />
            <h2>All caught up.</h2>
            <p>{all.length} stories, done. They&apos;re all here until tomorrow&apos;s edition, so you can start over any time.{ln.length ? ` We'll lean into ${ln.join(', ')} tomorrow.` : ''}</p>
            <div className="endbtns">
              {nLiked > 0 && <button className="pill solid" onClick={() => setOverlay({ kind: 'roundup' })}>Listen to your roundup ({nLiked})</button>}
              {extra > 0 && <button className="pill solid gold" onClick={() => update((x) => showMax(x, ed))}>Maximum receipts · {extra} more</button>}
              <button className="pill" onClick={restart}>Start over from story 1</button>
              {anyOn && <button className="pill" onClick={() => setOverlay({ kind: 'puzzles' })}>Today&apos;s puzzles</button>}
              <button className="pill" onClick={() => update((x) => ({ ...x, mode: 'scroll' }))}>Open the full edition</button>
            </div>
          </div>
          <EndExtras />
        </div>
      </div>
    );
  }

  const todaySaved = st.saves.filter((e) => e.issue === ed.issue).length;
  return (
    <div className="deckwrap">
      <div className="mast">
        <span className="mast-k">{st.name ? brandFor(st.name) : <>Today&apos;s Daily Receipts</>}</span>
        <span className="mast-row"><b className="mast-d">{mastDate(ed.date)}</b><span className="mast-n">No. {ed.issue}</span></span>
      </div>
      <div className="dtop">
        <p className="dcount" aria-live="polite">{done + 1} of {all.length}<span className="dmin"> · {minutes(deck.length)} min left</span></p>
        <span className="dpills"><DailyBadge />{anyOn && <button className="rpill" onClick={() => setOverlay({ kind: 'puzzles' })}>Puzzles</button>}<button className="rpill" onClick={() => setOverlay({ kind: 'roundup' })}>Roundup · {nLiked}</button></span>
      </div>
      <div className="deck" id="deck" ref={deckRef}>
        {deck.slice(0, 3).map((s, i) => ({ s, i })).reverse().map(({ s, i }) => (
          <Card key={s.id} s={s} depth={i} onGesture={i === 0 ? wire : undefined} />
        ))}
      </div>
      <div className="dbtns">
        <button className="dbtn" onClick={() => commit('less')} aria-label="Less like this"><Icon.cross /></button>
        <button className="dbtn small" onClick={undo} disabled={!st.swiped.length} aria-label="Undo last swipe"><Icon.undo /></button>
        <button className="dbtn keep" onClick={() => commit('later')} aria-label="Save for later"><Icon.keep /></button>
        <button className="dbtn love" onClick={() => commit('more')} aria-label="More like this"><Icon.heart /></button>
      </div>
      <p className="hint">Right for more, left for less, up to save for later.</p>
      <div className="dlinks">
        <button className="dlink" onClick={restart} disabled={!done}>Start over</button>
        <button className="dlink" onClick={() => setOverlay({ kind: 'saved' })}>Saved for later · {st.saves.length}</button>
        {todaySaved > 0 && done > 0 && <button className="dlink" onClick={() => update((x) => reswipeSaved(x, ed))}>Swipe saved again</button>}
        <button className="dlink" onClick={() => setOverlay({ kind: 'tour' })}>How it works</button>
        <InstallButton className="dlink" from="deck" />
      </div>
    </div>
  );
}
