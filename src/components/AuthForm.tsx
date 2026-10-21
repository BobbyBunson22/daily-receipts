'use client';
import { useState } from 'react';

import { track } from '../lib/reader/track';
import { supabaseBrowser } from '../lib/supabase/browser';
import { Icon } from './brand';

/** Google sign-in shows only once it's switched on in Supabase (set NEXT_PUBLIC_GOOGLE_SIGNIN=on). */
const GOOGLE_ON = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === 'on';

/**
 * Email (a code to type, or a link) or Google. No passwords. The same form signs up and signs in.
 * The code is the dependable way on phones: the email's link often opens in a different browser
 * from the one the reader started in, while the code signs them in right where they are.
 */
export function AuthForm({ from, next = '/' }: { from: string; next?: string }) {
  const db = supabaseBrowser();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState('');
  const [verifying, setVerifying] = useState(false);

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
    setMsg(`We've emailed ${clean}. Type the code from the email below, or tap its button. It can take a minute, and may land in spam.`);
  };

  // The code in the email: signs in right here, whichever app the email opens in
  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.replace(/\D/g, '');
    if (token.length < 6) {
      setCodeMsg('The code is the 6-digit number in the email.');
      return;
    }
    setVerifying(true);
    setCodeMsg('');
    const { error } = await db.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
    setVerifying(false);
    if (error) {
      setCodeMsg(/expired|invalid/i.test(error.message) ? "That code didn't work. Check it, or send a new email." : "Couldn't check the code just now. Try again in a moment.");
      return;
    }
    track('signin', { provider: 'email', via: 'code', from });
    setCodeMsg('Signed in.');
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
      {GOOGLE_ON && (
        <>
          <button type="button" className="gbtn" onClick={google}><Icon.google />Continue with Google</button>
          <div className="or">or</div>
        </>
      )}
      {state === 'sent' ? (
        <>
          <p className="authmsg" role="status">{msg}</p>
          <form className="auth codeform" onSubmit={verifyCode} noValidate>
            <label htmlFor="auth-code">Code from the email</label>
            <div className="coderow">
              <input id="auth-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10}
                value={code} onChange={(e) => { setCode(e.target.value); setCodeMsg(''); }} placeholder="123456" />
              <button className="pill solid" type="submit" disabled={verifying}>{verifying ? 'Checking…' : 'Sign in'}</button>
            </div>
            {codeMsg && <p className={`authmsg${codeMsg === 'Signed in.' ? '' : ' err'}`} role="status">{codeMsg}</p>}
          </form>
          <button type="button" className="linkish" onClick={() => { setState('idle'); setCode(''); setCodeMsg(''); }}>Use a different email, or send again</button>
        </>
      ) : (
        <form className="auth" onSubmit={sendLink} noValidate>
          <label htmlFor="auth-email">Your email</label>
          <input id="auth-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          <button className="pill solid" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Email me a code'}</button>
          {state === 'error' && <p className="authmsg err" role="alert">{msg}</p>}
        </form>
      )}
      <p className="authnote">New here? The same email creates your account. We only use your email to sign you in. See <a href="/privacy">privacy</a>.</p>
    </div>
  );
}
