import { outboundUrl } from '../outbound';

describe('outboundUrl', () => {
  it('tags article links so the outlet sees the visit came from Daily Receipts', () => {
    const u = new URL(outboundUrl('https://www.itv.com/news/2026-10-15/some-story'));
    expect(u.searchParams.get('utm_source')).toBe('dailyreceipts');
    expect(u.searchParams.get('utm_medium')).toBe('referral');
    expect(u.pathname).toBe('/news/2026-10-15/some-story');
  });
  it('keeps existing query strings, fragments and any utm the link already has', () => {
    expect(outboundUrl('https://a.example/x?id=3#top')).toBe('https://a.example/x?id=3&utm_source=dailyreceipts&utm_medium=referral&utm_campaign=receipts#top');
    expect(outboundUrl('https://a.example/x?utm_source=rss')).toBe('https://a.example/x?utm_source=rss');
  });
  it('leaves anything that is not a web link alone', () => {
    expect(outboundUrl('not a url')).toBe('not a url');
    expect(outboundUrl('mailto:x@y.z')).toBe('mailto:x@y.z');
  });
});
