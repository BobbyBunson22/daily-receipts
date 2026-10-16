/**
 * Links out to an outlet's article, tagged so the outlet's own analytics can see the visit
 * came from Daily Receipts: utm_source/utm_medium on the URL, and the referrer left on
 * (links use rel="noopener", not "noreferrer"). Existing utm values are kept.
 */
export function outboundUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return url;
    if (!u.searchParams.has('utm_source')) {
      u.searchParams.set('utm_source', 'dailyreceipts');
      u.searchParams.set('utm_medium', 'referral');
      u.searchParams.set('utm_campaign', 'receipts');
    }
    return u.toString();
  } catch {
    return url;
  }
}
