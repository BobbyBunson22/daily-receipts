/**
 * "Keep me signed in". Sessions last (a long-lived cookie) unless the reader unticks it; then a
 * marker cookie with no expiry date is set, which the browser drops when it closes. If the reader
 * asked not to be remembered and that marker has gone, the browser has been closed since: sign out.
 */
const KEY = 'dr.remember';
const LIVE = 'dr_live';

export function setRemember(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
    document.cookie = `${LIVE}=1; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch {
    // private mode: falls back to staying signed in
  }
}

export function clearRemember(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing stored
  }
}

/** True when the reader asked not to stay signed in and the browser has been closed since. */
export function sessionShouldEnd(): boolean {
  try {
    return localStorage.getItem(KEY) === '0' && !document.cookie.split(/;\s*/).some((c) => c.startsWith(`${LIVE}=`));
  } catch {
    return false;
  }
}

export const PASSWORD_MIN = 8;

/** Plain-words reasons for Supabase's sign-in errors. */
export function authProblem(err: { message?: string; code?: string } | null | undefined): string {
  const code = err?.code ?? '';
  const m = err?.message ?? '';
  if (code === 'invalid_credentials' || /invalid login/i.test(m))
    return "That email and password don't match. Signed up with an emailed code? Tap “Email me a code” below, then add a password.";
  if (code === 'weak_password' || /weak|pwned|leaked/i.test(m)) return 'Pick a stronger password: longer, and not one used on other sites.';
  if (code === 'same_password') return "That's already your password.";
  if (code === 'otp_disabled' || code === 'user_not_found' || /signups not allowed/i.test(m)) return 'No account with that email yet. Tap “Sign up” to make one.';
  if (code === 'email_not_confirmed') return 'Confirm your email first: tap “Email me a code” below.';
  if (/rate|limit|seconds/i.test(m) || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Too many tries. Wait a minute, then try again.';
  if (/expired|invalid/i.test(m) || code === 'otp_expired') return "That code didn't work. Check it, or send a new one.";
  return "That didn't work just now. Try again in a moment.";
}
