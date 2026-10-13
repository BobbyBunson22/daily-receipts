import type { Metadata } from 'next';
import Link from 'next/link';

import { Logo } from '../../components/brand';
import { CONTACT_EMAIL } from '../../lib/site';

export const metadata: Metadata = { title: 'Privacy' };

export default function Privacy() {
  return (
    <main className="page">
      <article className="rcpt">
        <Logo />
        <h1>Privacy, in plain English</h1>
        <p>Daily Receipts is in beta. Here is what we keep and why.</p>
        <h2>If you just read</h2>
        <p>Your choices (topics, likes, saves) are kept in your browser. We also record what you do in the app, such as opening it, swiping a card or playing your roundup, against a random code for your browser. That tells us whether people come back and which stories they find useful. It isn&apos;t linked to your name or email, and we don&apos;t use advertising trackers.</p>
        <h2>If you sign up</h2>
        <p>We keep your email address so you can sign in, and your choices so they follow you between devices. If you sign in with Google we receive your name and email from Google, nothing else.</p>
        <h2>Feedback</h2>
        <p>Answers to the feedback questions are kept with the edition they were about, and with your account if you&apos;re signed in.</p>
        <h2>Where it lives</h2>
        <p>Data is stored with Supabase in the EU (Frankfurt). We don&apos;t sell or share it.</p>
        <h2>Deleting it</h2>
        <p>{CONTACT_EMAIL ? <>Email <b>{CONTACT_EMAIL}</b></> : 'Contact the person who invited you to the beta'} and we&apos;ll delete your account and everything linked to it. Clearing your browser&apos;s site data removes what&apos;s stored on your device.</p>
      </article>
      <nav className="foot" aria-label="More"><Link href="/">Today&apos;s edition</Link><Link href="/signin">Sign in</Link></nav>
    </main>
  );
}
