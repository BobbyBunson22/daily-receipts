import { authProblem, clearRemember, sessionShouldEnd, setRemember } from '../remember';

// a tiny browser: localStorage, and cookies that vanish when the browser "closes"
const store = new Map<string, string>();
let cookies: Record<string, string> = {};
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k), clear: () => store.clear() },
  location: { protocol: 'https:' },
  document: {
    get cookie() { return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '); },
    set cookie(c: string) { const [kv] = c.split(';'); const [k, v] = kv.split('='); cookies[k] = v; },
  },
});
const dropLive = () => { cookies = {}; };

describe('keep me signed in', () => {
  beforeEach(() => { localStorage.clear(); dropLive(); });

  it('stays signed in by default, and when ticked', () => {
    expect(sessionShouldEnd()).toBe(false);
    setRemember(true);
    dropLive(); // browser closed
    expect(sessionShouldEnd()).toBe(false);
  });

  it('ends the session once the browser has closed, when unticked', () => {
    setRemember(false);
    expect(sessionShouldEnd()).toBe(false); // same browser session
    dropLive(); // browser closed: the no-expiry cookie is gone
    expect(sessionShouldEnd()).toBe(true);
    clearRemember();
    expect(sessionShouldEnd()).toBe(false);
  });
});

describe('sign-in errors in plain words', () => {
  it('explains a wrong password and points to the code', () => {
    expect(authProblem({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toMatch(/Email me a code/);
  });
  it('says when there is no account', () => {
    expect(authProblem({ message: 'Signups not allowed for otp' })).toMatch(/Sign up/);
  });
  it('asks for a stronger password', () => {
    expect(authProblem({ code: 'weak_password' })).toMatch(/stronger/);
  });
});
