'use client';
/**
 * Sharing a roundup ("Jay’s roundup") as a link, saving it as one audio file, and the page a
 * shared roundup opens: a small player that brings the whole bulletin onto the phone first, so
 * it keeps playing without signal.
 */
import { useEffect, useRef, useState } from 'react';

import { Bulletin, type PlayerState, bulletinFile, bulletinMinutes, canSpeak } from '../lib/reader/bulletin';
import { brandFor, possessive, roundupFor } from '../lib/reader/name';
import { storyPath } from '../lib/reader/share';
import { setTrackingEdition, track } from '../lib/reader/track';
import type { ClientEdition, ClientStory, VoiceChoice } from '../lib/reader/types';
import { choiceName } from '../lib/reader/voices';
import { supabaseBrowser } from '../lib/supabase/browser';
import { Grade, Icon, Logo, mastDate, shortDate } from './brand';
import { ShareIcon } from './Share';

const fileName = (name: string, ed: ClientEdition) =>
  `${(name ? `${possessive(name)}-roundup` : 'Daily-Receipts-roundup').replace(/[’']/g, '').replace(/\s+/g, '-')}-${shortDate(ed.date).replace(/\s+/g, '-')}.mp3`;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** "Save audio": the whole bulletin as one mp3 on the phone. */
export function SaveAudioButton({ list, ed, voice, name, bulletin, toast, from }: {
  list: ClientStory[]; ed: ClientEdition; voice: VoiceChoice; name: string; bulletin: Bulletin | null; toast: (m: string) => void; from: string;
}) {
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const file = await bulletinFile(list, ed, voice, bulletin?.clips);
      if (!file) return toast("The audio isn't recorded yet. Try again in a little while");
      download(file.blob, fileName(name, ed));
      toast(file.missing ? `Saved. ${file.missing} ${file.missing === 1 ? 'story isn’t' : 'stories aren’t'} recorded yet, so ${file.missing === 1 ? 'it’s' : 'they’re'} left out` : 'Saved to your downloads');
      track('share', { what: 'roundup_audio', from, n: list.length });
    } catch {
      toast("Couldn't save the audio. Check your connection and try again");
    } finally {
      setBusy(false);
    }
  };
  return <button className="pill" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save audio'}</button>;
}

/** "Share Jay’s roundup": saves the roundup as a link, then the share sheet (or copies it). */
export function ShareRoundupButton({ list, ed, voice, name, toast }: { list: ClientStory[]; ed: ClientEdition; voice: VoiceChoice; name: string; toast: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const share = async () => {
    const db = supabaseBrowser();
    if (!db || ed.id === null) return toast('Sharing works on the live site');
    setBusy(true);
    try {
      const { data, error } = await db.rpc('dr_share_roundup', { p_edition: ed.id, p_stories: list.map((s) => s.id), p_voice: voice, p_name: name || null });
      if (error || typeof data !== 'string') throw new Error(error?.message);
      const url = `${location.origin}/r/${data}`;
      const title = roundupFor(name).replace(/^Your/, 'My');
      const text = `${title}: ${list.length} ${list.length === 1 ? 'story' : 'stories'}, about ${bulletinMinutes(list, ed, voice)} min, with receipts. Have a listen.`;
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      if (nav.share) {
        try {
          await nav.share({ title, text, url });
          track('share', { what: 'roundup', via: 'sheet', n: list.length });
        } catch (e) {
          if ((e as Error)?.name !== 'AbortError') {
            await navigator.clipboard.writeText(url);
            toast('Link copied. Paste it anywhere');
          }
        }
      } else {
        await navigator.clipboard.writeText(url);
        toast('Link copied. Paste it anywhere');
        track('share', { what: 'roundup', via: 'copy', n: list.length });
      }
    } catch {
      toast("Couldn't make the link. Try again in a moment");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="pill solid" onClick={share} disabled={busy}>
      <ShareIcon /> {busy ? 'Making the link…' : `Share ${roundupFor(name).replace(/^Your/, 'your')}`}
    </button>
  );
}

/** A friend's roundup, opened from a link: a small player, the stories, and a way in. */
export function SharedRoundupPage({ code, ed, stories, voice, name }: {
  code: string; ed: ClientEdition; stories: ClientStory[]; voice: VoiceChoice; name: string;
}) {
  const [player, setPlayer] = useState<PlayerState>({ playing: false, paused: false, story: -1, n: 0, cached: 0 });
  const [msg, setMsg] = useState('');
  const [bulletin, setBulletin] = useState<Bulletin | null>(null);
  const [speak, setSpeak] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = (m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(''), 2600);
  };
  useEffect(() => {
    setTrackingEdition(ed.id);
    track('open', { roundup: code, n: stories.length });
    const b = new Bulletin((p, event) => {
      setPlayer(p);
      if (event === 'done') track('roundup_done', { shared: code, n: p.n });
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the player exists only in the browser
    setBulletin(b);
    setSpeak(canSpeak() || stories.some((s) => s.voices && Object.keys(s.voices).length));
    return () => b.stop();
  }, [code, ed.id, stories]);

  const title = roundupFor(name).replace(/^Your roundup$/, 'A Daily Receipts roundup');
  const status = !player.playing
    ? `About ${bulletinMinutes(stories, ed, voice)} min · read by ${choiceName(voice)}, AI ${voice === 'both' ? 'voices' : 'voice'}`
    : player.paused ? 'Paused' : player.story < 0 ? 'Playing' : `Story ${player.story + 1} of ${player.n}`;
  const offline = player.playing && (player.cached ?? 0) >= 1;

  return (
    <div className="rshare">
      <header className="rs-top">
        <a className="brand" href="/" aria-label="Daily Receipts, today's edition"><Logo inv /><span className="word">Daily Receipts</span></a>
      </header>
      <main className="wrap">
        <article className="rcpt rs-slip">
          <div className="rs-head">
            <span className="rs-k">{mastDate(ed.date)} · No. {ed.issue}</span>
            <h1>{title}</h1>
            <p className="stand">{stories.length} {stories.length === 1 ? 'story' : 'stories'} from the day&apos;s news, read in full. Every fact checked against its sources.</p>
          </div>
          {speak ? (
            <div className="player">
              <button className="pill solid" onClick={() => { if (!player.playing) track('roundup_play', { shared: code, n: stories.length }); bulletin?.toggle(stories, ed, voice); }}>
                {!player.playing ? 'Play' : player.paused ? 'Resume' : 'Pause'}
              </button>
              <button className="pill" onClick={() => bulletin?.next()} disabled={!player.playing}>Next story</button>
              <SaveAudioButton list={stories} ed={ed} voice={voice} name={name} bulletin={bulletin} toast={toast} from="shared" />
              <span className="bstat" aria-live="polite">{status}{offline ? ' · On your phone: plays without signal' : ''}</span>
            </div>
          ) : (
            <p className="muted">Audio isn&apos;t available in this browser. Try Safari or Chrome.</p>
          )}
          <ol className="rlist">
            {stories.map((s, i) => (
              <li key={s.id} className={player.playing && player.story === i ? 'now' : ''}>
                <span className="rn">{i + 1}</span>
                <div className="rbody">
                  <a className="hl" href={storyPath(s)}>{s.head}</a>
                  <small>{ed.sections.find((x) => x.id === s.sec)?.name} · {s.kept.length} facts checked</small>
                </div>
                <Grade grade={s.grade} />
              </li>
            ))}
          </ol>
          <div className="rs-cta">
            <h2>Get your own {name ? 'Receipts' : 'roundup'}</h2>
            <p>Pick your topics, swipe through today&apos;s news, and get your own roundup read to you. Free, and every fact comes with its sources.</p>
            <a className="pill solid" href="/">Read today&apos;s news <Icon.tick /></a>
            <p className="muted">{brandFor('')}: today&apos;s news, with receipts.</p>
          </div>
        </article>
      </main>
      <div className={`toast${msg ? ' on' : ''}`} role="status" aria-live="polite">{msg}</div>
    </div>
  );
}
