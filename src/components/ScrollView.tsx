'use client';
import { useState } from 'react';

import { affSec, liked, minutes, sectionLists, topStories, visible } from '../lib/reader/personalise';
import { isSaved } from '../lib/reader/state';
import type { ClientStory } from '../lib/reader/types';
import { Facts, Grade, Icon, Logo, VoiceBadge, cutLabel } from './brand';
import { EndExtras } from './EndExtras';
import { InstallHint } from './InstallHint';
import { usePuzzles } from './Puzzles';
import { useReader } from './ReaderContext';
import { AlsoReported } from './Sheets';

function Item({ s, why }: { s: ClientStory; why?: string }) {
  const { ed, st, openStory, react, toggleSave } = useReader();
  const r = st.react[s.id] ?? 0;
  const sec = ed.sections.find((x) => x.id === s.sec)?.name ?? s.sec;
  return (
    <article className="item" id={`s-${s.id}`}>
      <div className="meta"><span>{sec} · {s.sub}</span>{why && <span className="why">{why}</span>}<VoiceBadge story={s} name={ed.voice?.name} /><Grade grade={s.grade} /></div>
      <h3><button className="hl" onClick={() => openStory(s, 'scroll')}>{s.head}</button></h3>
      <Facts story={s} />
      <div className="total"><span>{s.kept.length} facts checked</span><span className={s.cut.length ? 'cutn' : ''}>{cutLabel(s)}</span><span>Grade {s.grade}</span></div>
      <div className="actions">
        <button className="pill" onClick={() => openStory(s, 'scroll')}>See the receipts</button>
        <span className="react">
          <button className="rb down" onClick={() => react(s, -1)} aria-pressed={r === -1} aria-label={`Less like this: ${s.head}`}><Icon.cross /></button>
          <button className="rb keep" onClick={() => toggleSave(s)} aria-pressed={isSaved(st, s.id)} aria-label={`Save for later: ${s.head}`}><Icon.keep /></button>
          <button className="rb up" onClick={() => react(s, 1)} aria-pressed={r === 1} aria-label={`More like this: ${s.head}`}><Icon.heart /></button>
        </span>
      </div>
      <AlsoReported story={s} compact />
    </article>
  );
}

export function ScrollView() {
  const { ed, st, setOverlay, update } = useReader();
  const [more, setMore] = useState<Record<string, boolean>>({});
  const { anyOn } = usePuzzles();
  const vis = visible(st, ed);
  const top = topStories(st, ed);
  const topIds = new Set(top.map((s) => s.id));
  const nLiked = liked(st, ed).length;

  return (
    <>
      <section className="intro">
        <div className="date">{ed.date} · No. {ed.issue}</div>
        <h1>Today&apos;s news, <span>with receipts.</span></h1>
        <p>The top {top.length} in about {minutes(top.length)} minutes. The rest if you fancy it.</p>
        <div className="stats">
          <span>{vis.length} stories</span>
          <span>{ed.outletCount} outlets checked</span>
          {st.streak.n > 1 && <span className="hot">Day {st.streak.n} streak</span>}
        </div>
        <p className="introbtn">
          <button className="rpill" onClick={() => setOverlay({ kind: 'roundup' })}>Your roundup · {nLiked}</button>
          <button className="rpill" onClick={() => setOverlay({ kind: 'saved' })}>Saved · {st.saves.length}</button>
          {anyOn && <button className="rpill" onClick={() => setOverlay({ kind: 'puzzles' })}>Puzzles</button>}
          <button className="rpill" onClick={() => setOverlay({ kind: 'tour' })}>How it works</button>
        </p>
        <InstallHint />
      </section>

      {!vis.length ? (
        <div className="rcpt"><div className="end"><h2>Nothing here yet</h2><p>Add topics or widen the grade filter.</p>
          <button className="pill" onClick={() => setOverlay({ kind: 'settings' })}>Your topics</button></div></div>
      ) : (
        <>
          <section className="rcpt" aria-labelledby="top-h">
            <div className="band"><h2 id="top-h">Top stories</h2><span>{minutes(top.length)} min</span></div>
            {top.map((s) => {
              const name = ed.sections.find((x) => x.id === s.sec)?.name;
              return <Item key={s.id} s={s} why={affSec(st, s.sec) >= 2 && name ? `Because you like ${name}` : ''} />;
            })}
          </section>
          <p className="between">Done with the top? Keep scrolling for more.</p>

          {sectionLists(st, ed, topIds).map(({ section, list, limit }) => {
            const shown = more[section.id] ? list : list.slice(0, limit);
            const extra = list.length - shown.length;
            return (
              <section className="rcpt" id={`sec-${section.id}`} key={section.id} aria-labelledby={`h-${section.id}`}>
                <div className="band"><h2 id={`h-${section.id}`}>{section.name}</h2><span>{list.length} more</span></div>
                {shown.map((s) => <Item key={s.id} s={s} />)}
                {extra > 0 && (
                  <button className="secmore" onClick={() => setMore((m) => ({ ...m, [section.id]: true }))}>{extra} more in {section.name}</button>
                )}
              </section>
            );
          })}

          <div className="rcpt last">
            <div className="end">
              <Logo />
              <h2>You&apos;re up to date.</h2>
              <p>That&apos;s today&apos;s receipts. The next edition drops tomorrow at about 6am.</p>
              <div className="endbtns">
                {nLiked > 0 && <button className="pill solid" onClick={() => setOverlay({ kind: 'roundup' })}>Listen to your roundup ({nLiked})</button>}
                {anyOn && <button className="pill" onClick={() => setOverlay({ kind: 'puzzles' })}>Today&apos;s puzzles</button>}
                <button className="pill" onClick={() => { update((x) => ({ ...x, mode: 'swipe', swiped: [] })); scrollTo(0, 0); }}>Start over in swipe</button>
              </div>
            </div>
            <EndExtras />
          </div>
        </>
      )}
    </>
  );
}
