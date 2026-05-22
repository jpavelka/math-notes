import { generateSW } from 'workbox-build';

const { count, size } = await generateSW({
  swDest: 'dist/sw.js',
  globDirectory: 'dist',
  globPatterns: [
    '**/*.{html,js,css,woff,woff2,ico,png,svg,webp,webmanifest}',
    'pagefind/**',
  ],
  skipWaiting: true,
  clientsClaim: true,
});

console.log(`Generated SW: ${count} precache entries, ${(size / 1024).toFixed(1)} KB total.`);
