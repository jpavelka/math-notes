#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

function write(filePath, content) {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (dir) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
}

// ── File templates ────────────────────────────────────────────────────────────

function packageJson(name) {
  return JSON.stringify({
    name,
    type: 'module',
    version: '0.1.0',
    scripts: {
      dev: 'astro dev',
      build: 'astro build',
      preview: 'astro preview',
    },
    dependencies: {
      'astro': '^5.0.0',
      'astro-math-book': 'latest',
      'react': '^19.0.0',
      'react-dom': '^19.0.0',
      'zod': '^3.0.0',
    },
    devDependencies: {
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
    },
  }, null, 2) + '\n';
}

const tsconfigJson = `\
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "resolveJsonModule": true,
    "plugins": [{ "name": "@mdx-js/typescript-plugin" }]
  }
}
`;

const astroConfigMjs = `\
import { defineConfig } from 'astro/config';
import { mathBook } from 'astro-math-book';
import { katexMacros } from './katex-macros.ts';

export default defineConfig({
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
  integrations: [
    mathBook({ katexMacros, bookSlug: 'chapters', contentDir: 'content', urlBase: '' }),
  ],
});
`;

const configTs = `\
export const SITE_TITLE = 'My Math Book';
export const SITE_TITLE_SHORT = 'Math Book';
`;

const katexMacrosTs = `\
/**
 * Custom KaTeX macros available in all math contexts.
 * Syntax: '\\\\commandName': 'expansion'
 * Use #1, #2, ... for arguments. Example:
 *   '\\\\norm': '\\\\left\\\\lVert #1 \\\\right\\\\rVert'
 */
export const katexMacros: Record<string, string> = {
  '\\\\R': '\\\\mathbb{R}',
  '\\\\Z': '\\\\mathbb{Z}',
  '\\\\N': '\\\\mathbb{N}',
};
`;

const referencesBib = `\
% Add BibTeX references here.
% Example:
%
% @book{rudin1976,
%   author    = {Rudin, Walter},
%   title     = {Principles of Mathematical Analysis},
%   year      = {1976},
%   publisher = {McGraw-Hill},
%   edition   = {3rd},
% }
`;

const contentConfigTs = `\
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { chapterSchema } from 'astro-math-book';

const chapters = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './content' }),
  schema: chapterSchema,
});

export const collections = { chapters };
`;

const componentsTs = `\
export * from 'astro-math-book/components';
`;

const indexAstro = `\
---
import { getCollection } from 'astro:content';

const chapters = await getCollection('chapters');
chapters.sort((a, b) => {
  const ca = a.data.chapter ?? Infinity;
  const cb = b.data.chapter ?? Infinity;
  return ca !== cb ? Number(ca) - Number(cb) : a.id.localeCompare(b.id);
});

const first = chapters.length > 0 ? \`/\${chapters[0].id}\` : null;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    {first && <meta http-equiv="refresh" content={\`0;url=\${first}\`} />}
  </head>
  <body>
    {first
      ? <p>Redirecting… <a href={first}>Click here if not redirected.</a></p>
      : <p>No chapters found. Add an <code>.mdx</code> file to <code>content/</code>.</p>
    }
  </body>
</html>
`;

const slugAstro = `\
---
import { getCollection, render } from 'astro:content';
import BookLayout from 'astro-math-book/BookLayout.astro';
import { SITE_TITLE, SITE_TITLE_SHORT } from '../../config.ts';

export async function getStaticPaths() {
  const entries = await getCollection('chapters');
  return entries.map(entry => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}

const { entry } = Astro.props;
const { Content, headings, remarkPluginFrontmatter } = await render(entry);
const headingTexts: string[] = remarkPluginFrontmatter.headingTexts ?? [];
---

<BookLayout
  title={entry.data.title}
  siteTitle={SITE_TITLE}
  siteTitleShort={SITE_TITLE_SHORT}
  chapter={entry.data.chapter}
  headings={headings}
  headingTexts={headingTexts}
  currentChapterId={entry.id}
  bookSlug="chapters"
  chapterBase=""
  pagefind={entry.data.pagefind ?? true}
>
  <Content />
</BookLayout>
`;

const introMdx = `\
---
title: "Introduction"
chapter: 1
---

import { Theorem, Definition, Proof, Ref } from '@/components';

Welcome to your math book! Edit this file at \`content/01-intro.mdx\` to get started.

## A first theorem

<Theorem id="thm:example" title="Example Theorem">
  For all $n \\in \\mathbb{N}$, $n + 0 = n$.
</Theorem>

<Proof for="thm:example">
  Follows directly from the definition of addition.
</Proof>

By <Ref id="thm:example" />, addition by zero is the identity.
`;

const gitignore = `\
node_modules/
dist/
.astro/
pdfs/
`;

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let dir = 'book';

  if (existsSync(dir)) {
    console.log(`\nA "${dir}" directory already exists in the current folder.`);
    dir = await ask('Enter a name for the new book directory: ');
    if (!dir) { console.error('No name provided. Exiting.'); process.exit(1); }
    if (existsSync(dir)) { console.error(`"${dir}" already exists. Exiting.`); process.exit(1); }
  }

  const name = dir.replace(/[^a-z0-9-]/gi, '-').toLowerCase();

  console.log(`\nCreating book in ./${dir}/\n`);

  write(`${dir}/package.json`,             packageJson(name));
  write(`${dir}/tsconfig.json`,            tsconfigJson);
  write(`${dir}/astro.config.mjs`,         astroConfigMjs);
  write(`${dir}/config.ts`,               configTs);
  write(`${dir}/katex-macros.ts`,          katexMacrosTs);
  write(`${dir}/references.bib`,           referencesBib);
  write(`${dir}/.gitignore`,              gitignore);
  write(`${dir}/src/content.config.ts`,   contentConfigTs);
  write(`${dir}/src/components.ts`,       componentsTs);
  write(`${dir}/src/pages/index.astro`,   indexAstro);
  write(`${dir}/src/pages/[...slug].astro`, slugAstro);
  write(`${dir}/content/01-intro.mdx`,    introMdx);

  const files = [
    'package.json', 'tsconfig.json', 'astro.config.mjs', 'config.ts',
    'katex-macros.ts', 'references.bib', '.gitignore',
    'src/content.config.ts', 'src/components.ts',
    'src/pages/index.astro', 'src/pages/[...slug].astro',
    'content/01-intro.mdx',
  ];
  for (const f of files) console.log(`  created  ${dir}/${f}`);

  console.log(`
Done! Next steps:

  cd ${dir}
  npm install
  npm run dev
`);
}

main().catch(err => { console.error(err); process.exit(1); });
