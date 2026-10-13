import type { Metadata } from 'next';
import Link from 'next/link';

import { Logo } from '../../components/brand';
import { supabaseServer } from '../../lib/supabase/server';
import { hasSupabase } from '../../lib/supabase/env';
import './admin.css';

export const metadata: Metadata = { title: 'Beta dashboard', robots: { index: false } };
export const dynamic = 'force-dynamic';

interface Overview {
  people: { accounts: number; accounts_7d: number; visitors_all: number; visitors_today: number; visitors_7d: number; installed: number };
  returns: { next_day: number | null; next_day_base: number; week: number | null; week_base: number };
  engagement: {
    sessions_7d: number; deck_done_rate: number | null; swipes_per_visit: number | null; likes_per_visit: number | null;
    swipe_split: Record<string, number> | null; mode_split: Record<string, number> | null;
    roundup_plays_7d: number; roundup_finished_7d: number; stories_opened_7d: number; sources_clicked_7d: number; saves_7d: number;
  };
  feedback: { answers: number; useful_avg: number | null; trust: Record<string, number> | null; pay: Record<string, number> | null; mode: Record<string, number> | null };
  daily: { day: string; visitors: number; signups: number; swipes: number; plays: number; finished: number }[];
  sections: { sec: string; likes: number; skips: number; saves: number }[] | null;
}

const pct = (v: number | null | undefined) => (v == null ? '–' : `${v}%`);
const num = (v: number | null | undefined) => (v == null ? '–' : v.toLocaleString('en-GB'));
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const when = (d: string | null) => (d ? new Date(d).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="adm">
      <header className="adm-top"><Link href="/" className="brand"><Logo inv /><span className="word">Daily Receipts</span></Link><span className="adm-tag">Beta dashboard</span></header>
      {children}
    </main>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="tile">
      <span className="tile-k">{label}</span>
      <b className="tile-v">{value}</b>
      {note && <span className="tile-n">{note}</span>}
    </div>
  );
}

function Split({ data, order }: { data: Record<string, number> | null; order: [string, string][] }) {
  const total = order.reduce((a, [k]) => a + (data?.[k] ?? 0), 0);
  if (!total) return <p className="muted">No answers yet.</p>;
  return (
    <div className="split">
      {order.map(([k, label]) => {
        const n = data?.[k] ?? 0;
        const p = Math.round((100 * n) / total);
        return (
          <div className="split-row" key={k}>
            <span>{label}</span>
            <i><b style={{ width: `${p}%` }} /></i>
            <em>{p}% · {n}</em>
          </div>
        );
      })}
    </div>
  );
}

export default async function Admin() {
  if (!hasSupabase()) return <Shell><div className="rcpt pad"><h1>Not connected</h1><p>Supabase isn&apos;t configured for this preview.</p></div></Shell>;
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user)
    return (
      <Shell>
        <div className="rcpt pad"><h1>Sign in to see the dashboard</h1><p>This page is for the Daily Receipts team.</p><p><a className="pill solid" href="/signin?next=/admin">Sign in</a></p></div>
      </Shell>
    );

  const [ov, fb, people, stories] = await Promise.all([
    db.rpc('dr_admin_overview', { days: 14 }),
    db.rpc('dr_admin_feedback', { lim: 60 }),
    db.rpc('dr_admin_people', { lim: 200 }),
    db.rpc('dr_admin_stories', {}),
  ]);
  if (ov.error)
    return (
      <Shell>
        <div className="rcpt pad"><h1>Not for this account</h1><p>You&apos;re signed in as {user.email}, which isn&apos;t on the team list.</p></div>
      </Shell>
    );

  const o = ov.data as Overview;
  const maxV = Math.max(1, ...o.daily.map((d) => d.visitors));
  const swipes = o.engagement.swipe_split ?? {};
  const totalSwipes = (swipes.more ?? 0) + (swipes.less ?? 0) + (swipes.later ?? 0);

  return (
    <Shell>
      <section className="adm-head">
        <h1>Is it becoming a habit?</h1>
        <p>Updated {when(new Date().toISOString())}. People are counted by browser until they sign in, then by account. London days.</p>
      </section>

      <section className="rcpt pad" aria-labelledby="h-ret">
        <h2 id="h-ret">Coming back</h2>
        <div className="tiles">
          <Tile label="Back the next day" value={pct(o.returns.next_day)} note={o.returns.next_day_base ? `of ${o.returns.next_day_base} visits` : 'needs 2 full days'} />
          <Tile label="Back within a week" value={pct(o.returns.week)} note={o.returns.week_base ? `of ${o.returns.week_base} visits` : 'needs 8 full days'} />
          <Tile label="Readers today" value={num(o.people.visitors_today)} note={`${num(o.people.visitors_7d)} in 7 days`} />
          <Tile label="Accounts" value={num(o.people.accounts)} note={`+${num(o.people.accounts_7d)} this week`} />
          <Tile label="Finished the deck" value={pct(o.engagement.deck_done_rate)} note="of visits, 7 days" />
          <Tile label="On home screen" value={num(o.people.installed)} note="opened as an app" />
        </div>
      </section>

      <section className="rcpt pad" aria-labelledby="h-daily">
        <h2 id="h-daily">Readers per day, last 14 days</h2>
        <div className="bars" role="img" aria-label={`Readers per day. Highest ${maxV}.`}>
          {o.daily.map((d) => (
            <div className="bar" key={d.day} tabIndex={0} aria-label={`${day(d.day)}: ${d.visitors} readers, ${d.signups} sign-ups`}>
              <span className="bar-v">{d.visitors || ''}</span>
              <i style={{ height: `${(d.visitors / maxV) * 100}%` }} />
              <span className="bar-tip" role="tooltip">{day(d.day)}<br />{d.visitors} readers · {d.signups} sign-ups<br />{d.swipes} swipes · {d.plays} plays</span>
              <span className="bar-d">{day(d.day).split(' ')[1]}</span>
            </div>
          ))}
        </div>
        <details>
          <summary>As a table</summary>
          <div className="scrollx">
            <table>
              <thead><tr><th>Day</th><th>Readers</th><th>Sign-ups</th><th>Swipes</th><th>Finished deck</th><th>Roundup plays</th></tr></thead>
              <tbody>{o.daily.slice().reverse().map((d) => <tr key={d.day}><td>{day(d.day)}</td><td>{d.visitors}</td><td>{d.signups}</td><td>{d.swipes}</td><td>{d.finished}</td><td>{d.plays}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="rcpt pad" aria-labelledby="h-use">
        <h2 id="h-use">How they use it (7 days)</h2>
        <div className="tiles">
          <Tile label="Visits" value={num(o.engagement.sessions_7d)} />
          <Tile label="Swipes per visit" value={num(o.engagement.swipes_per_visit)} />
          <Tile label="Likes per visit" value={num(o.engagement.likes_per_visit)} />
          <Tile label="Roundup plays" value={num(o.engagement.roundup_plays_7d)} note={`${num(o.engagement.roundup_finished_7d)} played to the end`} />
          <Tile label="Receipts opened" value={num(o.engagement.stories_opened_7d)} note={`${num(o.engagement.sources_clicked_7d)} source links clicked`} />
          <Tile label="Saved for later" value={num(o.engagement.saves_7d)} />
        </div>
        <h3>Swipes</h3>
        {totalSwipes ? <Split data={swipes} order={[['more', 'More like this'], ['less', 'Less'], ['later', 'Later']]} /> : <p className="muted">No swipes yet.</p>}
        <h3>Opened in</h3>
        <Split data={o.engagement.mode_split} order={[['swipe', 'Swipe'], ['scroll', 'Scroll']]} />
        <h3>Sections, last 14 days</h3>
        {o.sections?.length ? (
          <div className="scrollx">
            <table>
              <thead><tr><th>Section</th><th>Liked</th><th>Skipped</th><th>Saved</th></tr></thead>
              <tbody>{o.sections.map((s) => <tr key={s.sec}><td>{s.sec}</td><td>{s.likes}</td><td>{s.skips}</td><td>{s.saves}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="muted">No swipes yet.</p>}
      </section>

      <section className="rcpt pad" aria-labelledby="h-fb">
        <h2 id="h-fb">What they say</h2>
        <div className="tiles">
          <Tile label="Answers" value={num(o.feedback.answers)} />
          <Tile label="Usefulness" value={o.feedback.useful_avg == null ? '–' : `${o.feedback.useful_avg} / 5`} />
        </div>
        <h3>Would pay £39 a year</h3>
        <Split data={o.feedback.pay} order={[['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']]} />
        <h3>Trust the facts</h3>
        <Split data={o.feedback.trust} order={[['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']]} />
        <h3>Latest answers</h3>
        {fb.data?.length ? (
          <ul className="fblist">
            {(fb.data as { at: string; who: string; issue: number; useful: number; trust: string; mode: string; pay: string; wish: string | null }[]).map((f, i) => (
              <li key={i}>
                <div className="fb-meta"><b>{f.who}</b><span>No. {f.issue} · {when(f.at)}</span></div>
                <div className="fb-ans">Useful {f.useful}/5 · Trust {f.trust ?? '–'} · Prefers {f.mode ?? '–'} · Pay {f.pay}</div>
                {f.wish && <p>&ldquo;{f.wish}&rdquo;</p>}
              </li>
            ))}
          </ul>
        ) : <p className="muted">No feedback yet.</p>}
      </section>

      <section className="rcpt pad" aria-labelledby="h-st">
        <h2 id="h-st">Today&apos;s stories</h2>
        <div className="scrollx">
          <table>
            <thead><tr><th>Story</th><th>Grade</th><th>Swiped</th><th>Liked</th><th>Skipped</th><th>Saved</th><th>Opened</th></tr></thead>
            <tbody>
              {((stories.data ?? []) as { slug: string; head: string; sec: string; grade: string; shown: number; likes: number; skips: number; saves: number; opens: number }[]).map((s) => (
                <tr key={s.slug}><td className="wrapcell">{s.head}<small>{s.sec}</small></td><td>{s.grade}</td><td>{s.shown}</td><td>{s.likes}</td><td>{s.skips}</td><td>{s.saves}</td><td>{s.opens}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rcpt pad" aria-labelledby="h-pp">
        <h2 id="h-pp">People with accounts</h2>
        <div className="scrollx">
          <table>
            <thead><tr><th>Email</th><th>Joined</th><th>Last seen</th><th>Days</th><th>Swipes</th><th>Likes</th><th>Saves</th><th>Plays</th><th>Likes most</th></tr></thead>
            <tbody>
              {((people.data ?? []) as { email: string; joined: string; last_seen: string | null; days_active: number; swipes: number; likes: number; saves: number; plays: number; top_sections: string | null }[]).map((p) => (
                <tr key={p.email}><td className="wrapcell">{p.email}</td><td>{when(p.joined)}</td><td>{when(p.last_seen)}</td><td>{p.days_active}</td><td>{p.swipes}</td><td>{p.likes}</td><td>{p.saves}</td><td>{p.plays}</td><td>{p.top_sections ?? '–'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  );
}
