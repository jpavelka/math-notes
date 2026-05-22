import { defineConfig } from 'astro/config';
import { mathBook } from 'astro-math-book';
import { katexMacros } from './katex-macros.ts';
import { symbols } from './symbols.ts';
import { manifest as siteManifest } from './src/manifest.ts';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MANIFEST = JSON.stringify(siteManifest);

function serveManifest(req, res, next) {
  if (req.url !== '/manifest.webmanifest') return next();
  const buf = Buffer.from(MANIFEST);
  res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Content-Length': buf.length });
  res.end(buf);
}

function manifestPlugin() {
  return {
    name: 'manifest-json',
    configureServer(server) { server.middlewares.use(serveManifest); },
    configurePreviewServer(server) { server.middlewares.use(serveManifest); },
  };
}

export default defineConfig({
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
  vite: {
    resolve: {
      alias: {
        '@': join(__dirname, 'src'),
      },
      dedupe: ['react', 'react-dom'],
    },
    plugins: [
      manifestPlugin(),
    ],
  },
  integrations: [
    mathBook({ katexMacros, symbols, bookSlug: 'sample', contentDir: 'content', urlBase: '', bibliographyHref: '/d-references' }),
  ],
});
