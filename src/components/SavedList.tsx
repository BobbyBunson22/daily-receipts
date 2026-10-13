'use client';
import { savedGroups } from '../lib/reader/state';
import type { ClientStory, SavedEntry } from '../lib/reader/types';
import { Icon } from './brand';
import { useReader } from './ReaderContext';

/** Saved stories grouped by day. Today's can go straight into the roundup. */
export function SavedList() {
  const { ed, st, update, openStory, react, setOverlay } = useReader();
  const groups = savedGroups(st, ed);
  if (!groups.length)
    return <p className="muted">Nothing saved yet. Swipe a card up, or tap the bookmark, to keep a story here. Saved stories stay until you remove them, even after today&apos;s edition is replaced.</p>;
  const starts = groups.map((_, gi) => groups.slice(0, gi).reduce((a, g) => a + g.entries.length, 0));
  const open = (e: SavedEntry, live: ClientStory | undefined) => {
    if (live) openStory(live, 'saved');
    else setOverlay({ kind: 'story', id: e.id, back: { kind: 'saved' } });
  };
  return (
    <>
      {groups.map((g, gi) => (
        <div key={g.label}>
          <h3 className="sgroup">{g.label}</h3>
          <ol className="rlist slist">
            {g.entries.map((e, ei) => {
              const n = starts[gi] + ei + 1;
              const live = g.today ? ed.stories.find((x) => x.id === e.id) : undefined;
              const s = live ?? e.s;
              return (
                <li key={e.id}>
                  <span className="rn">{n}</span>
                  <div className="rbody">
                    <button className="hl" onClick={() => open(e, live)}>{s.head}</button>
                    <small>{e.s.secName} · {s.kept.length} facts checked · Grade {s.grade}</small>
                  </div>
                  {live ? (
                    <button className="rb up" onClick={() => react(live, 1)} aria-pressed="false" aria-label={`Add to your roundup: ${s.head}`}><Icon.heart /></button>
                  ) : <span />}
                  <button className="rb" onClick={() => update((x) => ({ ...x, saves: x.saves.filter((y) => y.id !== e.id) }))} aria-label={`Remove from saved: ${s.head}`}><Icon.close /></button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </>
  );
}
