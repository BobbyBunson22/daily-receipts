import { headSlug, shareText, storyIdFrom, storyPath, storyUrl } from '../share';

describe('story links', () => {
  const s = { id: 285, head: 'Bus passengers in England could face £100 fines for playing music aloud', grade: 'B' as const, kept: [['a', 'b'], ['c', 'd']] as [string, string][] };

  it('reads well and carries the story id', () => {
    expect(headSlug(s.head)).toBe('bus-passengers-in-england-could-face-100-fines');
    expect(storyPath(s)).toBe('/s/285-bus-passengers-in-england-could-face-100-fines');
    expect(storyUrl(s, 'https://www.dailyreceipts.com/')).toBe('https://www.dailyreceipts.com/s/285-bus-passengers-in-england-could-face-100-fines');
    expect(headSlug('Raúl Castro: “Wanted”')).toBe('raul-castro-wanted');
  });

  it('finds the story from the link, whatever the words after the id', () => {
    expect(storyIdFrom('285-bus-passengers')).toBe(285);
    expect(storyIdFrom('285')).toBe(285);
    expect(storyIdFrom('bus-285')).toBeNull();
    expect(storyIdFrom('285abc')).toBeNull();
    expect(storyIdFrom('')).toBeNull();
  });

  it('the message says only what the story has', () => {
    expect(shareText(s)).toBe(`${s.head} (Grade B, 2 facts checked) via Daily Receipts`);
  });
});
