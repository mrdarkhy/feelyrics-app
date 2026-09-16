import type { MetadataRoute } from 'next';

/**
 * Installable as an app from the browser's own menu — no store, no review, no
 * account. On a phone that is the difference between a bookmark and something
 * that opens from the home screen with the brand mark on it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Feelyrics',
    short_name: 'Feelyrics',
    description:
      'Song lyrics translated into the closest possible feeling, not word for word.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b1511',
    theme_color: '#0b1511',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
