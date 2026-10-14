import type { MetadataRoute } from 'next';

/** Lets phones add Daily Receipts to the home screen as a full-screen app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Daily Receipts',
    short_name: 'Receipts',
    description: "Today's news, with receipts.",
    start_url: '/?source=homescreen',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0d1836',
    theme_color: '#0d1836',
    lang: 'en-GB',
    categories: ['news'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
