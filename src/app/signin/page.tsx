import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthForm } from '../../components/AuthForm';
import { Logo } from '../../components/brand';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <main className="page">
      <div className="rcpt">
        <Logo />
        <h1>Keep your receipts</h1>
        <p>Sign in or sign up. Your username, roundup, saves and topics follow you to every device.</p>
        {error && <p className="authmsg err" role="alert">That link didn&apos;t work. It may have expired or been opened on another device. Send a new one below.</p>}
        <AuthForm from="page" next={next?.startsWith('/') && !next.startsWith('//') ? next : '/'} />
      </div>
      <nav className="foot" aria-label="More"><Link href="/">Today&apos;s edition</Link><Link href="/privacy">Privacy</Link></nav>
    </main>
  );
}
