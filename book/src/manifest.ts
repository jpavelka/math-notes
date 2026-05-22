import { SITE_TITLE, SITE_TITLE_SHORT, DESCRIPTION } from '../config.ts';

export const manifest = {
  name: SITE_TITLE,
  short_name: SITE_TITLE_SHORT,
  description: DESCRIPTION,
  theme_color: '#ffffff',
  background_color: '#1e293b',
  display: 'standalone',
  start_url: '/',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
} as const;
