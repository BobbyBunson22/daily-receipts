/** Where to go after signing in from an email: framework-free so it can be tested. */
/** Only ever send people back into this site: a path here, never another site. */
export function safeNext(url: URL): string {
  const direct = url.searchParams.get('next');
  if (direct && direct.startsWith('/') && !direct.startsWith('//')) return direct;
  // the email template passes where the reader started ({{ .RedirectTo }}), e.g.
  // https://www.dailyreceipts.com/auth/callback?next=%2F%3Fclaim%3Djay
  const raw = url.searchParams.get('redirect_to');
  if (raw) {
    try {
      const r = new URL(raw);
      if (r.host === url.host || r.host.replace(/^www\./, '') === url.host.replace(/^www\./, '')) {
        const inner = r.pathname === '/auth/callback' ? r.searchParams.get('next') : `${r.pathname}${r.search}`;
        if (inner && inner.startsWith('/') && !inner.startsWith('//')) return inner;
      }
    } catch {
      // not a URL: home
    }
  }
  return '/';
}

