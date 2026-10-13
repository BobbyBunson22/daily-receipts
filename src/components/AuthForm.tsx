'use client';
import { useState } from 'react';

import { track } from '../lib/reader/track';
import { supabaseBrowser } from '../lib/supabase/browser';
import { Icon } from './brand';

/** Email link or Google. No passwords. The same form signs up and signs in. */
export function AuthForm({ from, next = '/' }: { from: string; next?: string }) {
  const db = supabaseBrowser();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  if (!db) return <p className="authmsg">Sign-in isn&apos;t set up on this preview yet.</p>;

  const redirectTo = () => `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setState('error');
      setMsg("That email address doesn't look right.");
      return;
    }
    setState('sending');
    track('signup_start', { method: 'email', from });
    const { error } = await db.auth.signInWithOtp({ email: clean, options: { emailRedirectTo: redirectTo(), shouldCreateUser: true } });
    if (error) {
      setState('error');
      setMsg(/rate|limit|seconds/i.test(error.message) ? 'Too many tries. Wait a minute, then send again.' : "Couldn't send the email just now. Try again in a moment.");
      return;
    }
    setState('sent');
    setMsg(`Check ${clean} for a link from Daily Receipts. Tap it on this device to finish. It may take a minute, and can land in spam.`);
  };

  const google = async () => {
    track('signup_start', { method: 'google', from });
    const { error } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
    if (error) {
      setState('error');
      setMsg("Google sign-in isn't available right now. Use your email instead.");
    }
  };

  return (
    <div className="auth">
      <button type="button" className="gbtn" onClick={google}><Icon.google />Continue with Google</button>
      <div className="or">or</div>
      {state === 'sent' ? (
        <p className="authmsg" role="status">{msg}</p>
      ) : (
        <form className="auth" onSubmit={sendLink} noValidate>
          <label htmlFor="auth-email">Your email</label>
          <input id="auth-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          <button className="pill solid" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}</button>
          {state === 'error' && <p className="authmsg err" role="alert">{msg}</p>}
        </form>
      )}
      <p className="authnote">New here? The same link creates your account. We only use your email to sign you in. See <a href="/privacy">privacy</a>.</p>
    </div>
  );
}
