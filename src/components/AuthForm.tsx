'use client';
import { useState } from 'react';

import { track } from '../lib/reader/track';
import { supabaseBrowser } from '../lib/supabase/browser';
import { PASSWORD_MIN, authProblem, setRemember } from '../lib/supabase/remember';
import { Icon } from './brand';

/** Google sign-in shows only once it's switched on in Supabase (set NEXT_PUBLIC_GOOGLE_SIGNIN=on). */
const GOOGLE_ON = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === 'on';

type Mode = 'signin' | 'signup' | 'code';
type Step = 'form' | 'verify' | 'setpw';

const okEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
/** Has anyone signed in on this device before? Then "Sign in" is the likelier first choice. */
const knownHere = () => {
  try {
    return localStorage.getItem('dr.remember') !== null;
  } catch {
    return false;
  }
};

/**
 * Sign up: email and a password, then the code we email (it proves the address is theirs).
 * Sign in: email and password. No password yet, or forgotten it: an emailed code signs them in,
 * then they can set one. "Keep me signed in" is on unless they untick it.
 * The code, not the email's link, is the dependable way on phones: the link often opens in a
 * different browser from the one the reader started in.
 */
export function AuthForm({ from, next = '/', start, onDone }: { from: string; next?: string; start?: 'signin' | 'signup'; onDone?: () => void }) {
  const db = supabaseBrowser();
  const [mode, setModeRaw] = useState<Mode>(() => start ?? (from === 'page' || knownHere() ? 'signin' : 'signup'));
  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRem] = useState(true);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!db) return <p className="authmsg">Sign-in isn&apos;t set up on this preview yet.</p>;

  const clean = email.trim();
  const redirectTo = () => `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const setMode = (m: Mode) => {
    setModeRaw(m);
    setStep('form');
    setMsg(null);
    setCode('');
  };
  const fail = (text: string) => setMsg({ text, err: true });
  const finish = (via: string) => {
    track('signin', { provider: 'email', via, from });
    if (onDone) onDone();
    else if (from === 'page') location.assign(next);
    else setMsg({ text: 'Signed in.' });
  };

  const sendCode = async () => {
    track('signup_start', { method: 'email', from, mode });
    const { error } = await db.auth.signInWithOtp({ email: clean, options: { emailRedirectTo: redirectTo(), shouldCreateUser: mode === 'signup' } });
    if (error) return fail(authProblem(error));
    setStep('verify');
    setMsg({ text: `We've emailed ${clean} a 6-digit code. Type it below. It can take a minute, and may land in spam.` });
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!okEmail(clean)) return fail("That email address doesn't look right.");
    if (mode !== 'code' && !password) return fail('Type your password.');
    if (mode === 'signup' && password.length < PASSWORD_MIN) return fail(`Your password needs at least ${PASSWORD_MIN} characters.`);
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await db.auth.signInWithPassword({ email: clean, password });
        if (error) return fail(authProblem(error));
        setRemember(remember);
        finish('password');
      } else await sendCode();
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return fail('The code is the 6-digit number in the email.');
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await db.auth.verifyOtp({ email: clean, token, type: 'email' });
      if (error) return fail(authProblem(error));
      setRemember(remember);
      if (mode === 'signup') {
        // signed in: now keep the password they picked on the account
        const { error: pwErr } = await db.auth.updateUser({ password });
        if (pwErr) {
          setStep('setpw');
          return fail(`You're signed in, but the password wasn't saved. ${authProblem(pwErr)}`);
        }
        return finish('signup');
      }
      setPassword('');
      setStep('setpw');
      setMsg({ text: "You're signed in. Add a password so next time it's just your email and password." });
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < PASSWORD_MIN) return fail(`Your password needs at least ${PASSWORD_MIN} characters.`);
    setBusy(true);
    const { error } = await db.auth.updateUser({ password });
    setBusy(false);
    if (error) return fail(authProblem(error));
    track('settings', { name: 'password_set', from });
    finish('code');
  };

  const google = async () => {
    setRemember(remember);
    track('signup_start', { method: 'google', from });
    const { error } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
    if (error) fail("Google sign-in isn't available right now. Use your email instead.");
  };

  const status = msg && <p className={`authmsg${msg.err ? ' err' : ''}`} role={msg.err ? 'alert' : 'status'}>{msg.text}</p>;
  const pwInput = (id: string, auto: 'current-password' | 'new-password', label: string) => (
    <>
      <label htmlFor={id}>{label}</label>
      <div className="pwrow">
        <input id={id} type={show ? 'text' : 'password'} autoComplete={auto} autoCapitalize="none" spellCheck={false}
          value={password} onChange={(e) => { setPassword(e.target.value); setMsg(null); }} minLength={auto === 'new-password' ? PASSWORD_MIN : undefined} />
        <button type="button" className="pwshow" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
      </div>
    </>
  );

  if (step === 'verify')
    return (
      <div className="auth">
        {status}
        <form className="auth codeform" onSubmit={submitCode} noValidate>
          <label htmlFor="auth-code">Code from the email</label>
          <div className="coderow">
            <input id="auth-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10}
              value={code} onChange={(e) => { setCode(e.target.value); setMsg(null); }} placeholder="123456" />
            <button className="pill solid" type="submit" disabled={busy}>{busy ? 'Checking…' : mode === 'signup' ? 'Sign up' : 'Sign in'}</button>
          </div>
        </form>
        <button type="button" className="linkish" onClick={() => setMode(mode)}>Use a different email, or send again</button>
      </div>
    );

  if (step === 'setpw')
    return (
      <div className="auth">
        {status}
        <form className="auth" onSubmit={submitPassword} noValidate>
          {/* lets password managers save the pair */}
          <input type="email" autoComplete="username" value={clean} readOnly hidden />
          {pwInput('auth-newpw', 'new-password', `New password (${PASSWORD_MIN}+ characters)`)}
          <button className="pill solid" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        </form>
        <button type="button" className="linkish" onClick={() => finish('code')}>Not now</button>
      </div>
    );

  return (
    <div className="auth">
      {mode === 'code' ? (
        <p className="authlead"><b>Sign in with an emailed code.</b> Handy if you&apos;ve forgotten your password, or never set one.</p>
      ) : (
        <div className="authtabs" role="group" aria-label="Sign in or sign up">
          <button type="button" aria-pressed={mode === 'signin'} onClick={() => setMode('signin')}>Sign in</button>
          <button type="button" aria-pressed={mode === 'signup'} onClick={() => setMode('signup')}>Sign up</button>
        </div>
      )}
      {GOOGLE_ON && mode !== 'code' && (
        <>
          <button type="button" className="gbtn" onClick={google}><Icon.google />Continue with Google</button>
          <div className="or">or</div>
        </>
      )}
      <form className="auth" onSubmit={submitForm} noValidate>
        <label htmlFor="auth-email">Your email</label>
        <input id="auth-email" type="email" inputMode="email" autoComplete={mode === 'code' ? 'email' : 'username'} autoCapitalize="none" spellCheck={false}
          value={email} onChange={(e) => { setEmail(e.target.value); setMsg(null); }} placeholder="you@example.com" required />
        {mode === 'signin' && pwInput('auth-pw', 'current-password', 'Password')}
        {mode === 'signup' && pwInput('auth-pw', 'new-password', `Pick a password (${PASSWORD_MIN}+ characters)`)}
        <label className="keep"><input type="checkbox" checked={remember} onChange={(e) => setRem(e.target.checked)} /> Keep me signed in</label>
        <button className="pill solid" type="submit" disabled={busy}>
          {busy ? (mode === 'signin' ? 'Signing in…' : 'Sending…') : mode === 'signin' ? 'Sign in' : 'Email me a code'}
        </button>
        {status}
      </form>
      {mode === 'signin' && <button type="button" className="linkish" onClick={() => setMode('code')}>Forgotten it, or never set one? Email me a code</button>}
      {mode === 'code' && <button type="button" className="linkish" onClick={() => setMode('signin')}>Back to password sign-in</button>}
      <p className="authnote">
        {mode === 'signup' ? "We'll email a code to check the address is yours. " : ''}
        We only use your email for your account. See <a href="/privacy">privacy</a>.
      </p>
    </div>
  );
}
