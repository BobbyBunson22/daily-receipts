import { safeNext } from '../safeNext';

const go = (q: string) => safeNext(new URL(`https://www.dailyreceipts.com/auth/confirm?token_hash=abc&type=email&${q}`));

describe('after the email link', () => {
  it('carries on to where the reader was going, including the username they picked', () => {
    expect(go('redirect_to=https://www.dailyreceipts.com/auth/callback?next=%2F%3Fclaim%3Djay')).toBe('/?claim=jay');
    expect(go('redirect_to=https://dailyreceipts.com/auth/callback?next=%2Fs%2F285-bus')).toBe('/s/285-bus');
    expect(go('next=/r/abc123')).toBe('/r/abc123');
    expect(go('')).toBe('/');
  });

  it('never sends anyone to another site', () => {
    expect(go('redirect_to=https://evil.example/auth/callback?next=%2F')).toBe('/');
    expect(go('redirect_to=https://www.dailyreceipts.com/auth/callback?next=%2F%2Fevil.example')).toBe('/');
    expect(go('next=//evil.example')).toBe('/');
    expect(go('next=https://evil.example')).toBe('/');
    expect(go('redirect_to=not a url')).toBe('/');
  });
});
