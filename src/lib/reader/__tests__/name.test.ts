import { brandFor, cleanName, displayName, possessive, roundupFor } from '../name';
import * as S from '../state';

describe('usernames', () => {
  it('make the app theirs', () => {
    expect(brandFor('jay')).toBe('Jay’s Receipts');
    expect(roundupFor('jay')).toBe('Jay’s roundup');
    expect(brandFor('')).toBe('Daily Receipts');
    expect(roundupFor('')).toBe('Your roundup');
    expect(possessive('James')).toBe('James’s');
    expect(displayName('McKenzie')).toBe('McKenzie');
    expect(displayName('élodie')).toBe('Élodie');
  });

  it('keep names tidy and short', () => {
    expect(cleanName('  jay  ')).toBe('jay');
    expect(cleanName('<b>Jay</b>')).toBe('bJayb');
    expect(cleanName('Mary-Jane O’Neil')).toBe('Mary-Jane O’Neil');
    expect(cleanName('jay 🎉 http://x.com')).toBe('jay httpx.com');
    expect(cleanName('a'.repeat(40))).toHaveLength(20);
    expect(cleanName('--- ')).toBe('');
    expect(cleanName(42)).toBe('');
  });

  it('are kept with the reader’s choices', () => {
    const ed = { issue: 1, date: '', compiled: '', id: 1, sections: [], stories: [], outletCount: 0 };
    expect(S.normalise({ name: '  jay ' }, ed).name).toBe('jay');
    expect(S.normalise({}, ed).name).toBe('');
    expect(S.setName(S.initialState(ed), ' Jay! ').name).toBe('Jay');
  });
});

describe('signing out', () => {
  const ed = { issue: 1, date: '', compiled: '', id: 1, sections: [], stories: [], outletCount: 0 };
  it('takes the secured username off this device; it stays on the account', () => {
    const st = { ...S.setName(S.initialState(ed), 'Jay'), secured: 'Jay' };
    const out = S.forgetAccount(st);
    expect(out.secured).toBe('');
    expect(out.name).toBe('');
  });
  it('leaves a name that was never secured', () => {
    const st = S.setName(S.initialState(ed), 'Sam');
    expect(S.forgetAccount(st).name).toBe('Sam');
  });
});
