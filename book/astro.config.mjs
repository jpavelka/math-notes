import { defineConfig } from 'astro/config';
import { mathBook } from 'astro-math-book';
import { katexMacros } from './katex-macros.ts';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    },
  },
  integrations: [
    mathBook({ katexMacros, bookSlug: 'sample', contentDir: 'content', urlBase: '' }),
  ],
});
