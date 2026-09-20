import type { MetadataRoute } from 'next';

/**
 * Makes ExamOS installable to a phone home screen.
 *
 * On iPhone, Share → Add to Home Screen then gives a real app icon that opens
 * without Safari's chrome. It is not an App Store app — that would need an
 * Apple developer account and a signed build — but it behaves like one, and it
 * is the route that matters for photographing a paper exam.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ExamOS',
    short_name: 'ExamOS',
    description: 'Know where you stand. Know what to do next.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // The logo's own background, so a phone's launch screen shows the icon on
    // its own colour instead of a square sitting on a different dark.
    background_color: '#04092e',
    theme_color: '#3949c9',
    categories: ['education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
