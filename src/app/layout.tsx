import '@fontsource-variable/bricolage-grotesque/wdth.css';
import '@fontsource-variable/newsreader/standard.css';
import '@fontsource-variable/newsreader/standard-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import './globals.css';

import type { Metadata, Viewport } from 'next';

import { SITE_URL } from '../lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Daily Receipts', template: '%s · Daily Receipts' },
  description: "Today's news, with receipts. Verified top stories, each reduced to a few key facts with the sources that back them.",
  applicationName: 'Daily Receipts',
  appleWebApp: { capable: true, title: 'Receipts', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  openGraph: { type: 'website', siteName: 'Daily Receipts', locale: 'en_GB' },
  twitter: { card: 'summary_large_image' },
  icons: { icon: [{ url: '/icons/favicon-48.png', sizes: '48x48' }, { url: '/icons/icon-192.png', sizes: '192x192' }], apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#0d1836',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
