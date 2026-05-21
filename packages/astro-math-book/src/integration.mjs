import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { remarkSectionRefs } from './plugins/remark-section-refs.mjs';
import { remarkHeadingTexts } from './plugins/remark-heading-texts.mjs';
import { remarkEquations } from './plugins/remark-equations.mjs';
import { remarkNumberEnvs } from './plugins/remark-number-envs.mjs';
import { registryIntegration } from './plugins/astro-registry.mjs';
import { bibliographyIntegration } from './plugins/bibliography.mjs';
import { rehypeCodeCopy } from './plugins/rehype-code-copy.mjs';
import './plugins/katex-cache.mjs';

const VM_MACROS   = 'virtual:astro-math-book/katex-macros';
const VM_REGISTRY = 'virtual:astro-math-book/registry';
const VM_BIB      = 'virtual:astro-math-book/bibliography';
const VM_BIB_HREF = 'virtual:astro-math-book/bibliography-href';

/**
 * @typedef {{
 *   name: string,
 *   type?: string,
 *   kind?: 'float',
 *   collectContent?: (node: any, helpers: { getAttrString: (attrs: any[], name: string) => string | null, nodesToHtml: (nodes: any[]) => string }) => { title?: string, contentHTML: string }
 * }} EnvDescriptor
 */

/**
 * @param {{ katexMacros?: Record<string,string>, numberedEnvironments?: string[], environments?: EnvDescriptor[], symbols?: import('./components/math/NotationTable').SymbolEntry[], symbolsSlug?: string, bookSlug?: string, contentDir?: string, urlBase?: string, bibliographyHref?: string }} [options]
 * @returns {import('astro').AstroIntegration}
 */
// Wraps a unified plugin attacher so each transformer call is timed in dev.
function timed(name, plugin) {
  return function timedAttacher(...args) {
    const transformer = plugin.apply(this, args);
    if (typeof transformer !== 'function') return transformer;
    return async (tree, file) => {
      const t = performance.now();
      const r = transformer(tree, file);
      if (r && typeof r.then === 'function') await r;
      process.stdout.write(`  [pipeline] ${name.padEnd(14)}: ${(performance.now() - t).toFixed(1)}ms\n`);
    };
  };
}

export function mathBook(options = {}) {
  const { katexMacros = {}, numberedEnvironments, environments = [], symbols = [], symbolsSlug = 'b-notation', bookSlug = 'chapters', contentDir, urlBase, bibliographyHref = '' } = options;
  const resolvedContentDir = contentDir ?? `src/content/${bookSlug}`;
  let projectRoot = '';

  return {
    name: 'astro-math-book',
    hooks: {
      'astro:config:done': ({ config }) => {
        projectRoot = config.root instanceof URL
          ? fileURLToPath(config.root)
          : String(config.root);
      },
      'astro:config:setup': ({ updateConfig, command }) => {
        // Lazy path — safe to use in load/build hooks because projectRoot
        // is set by astro:config:done before Vite buildStart runs.
        const getRegistryPath  = () => join(projectRoot, '.astro/registry.json');
        const getChaptersDir   = () => join(projectRoot, resolvedContentDir);
        const getBibPath      = () => join(projectRoot, '.astro/bibliography.json');

        const isDev = command === 'dev';
        const wrap = isDev ? timed : (_name, p) => p;

        // Bracket plugins: record start time on the VFile at remark phase,
        // then print total at the end of the rehype phase.
        function pipelineStart() {
          return (tree, file) => { file.data._t0 = performance.now(); };
        }
        function pipelineEnd() {
          return (tree, file) => {
            const ms = (performance.now() - (file.data._t0 ?? performance.now())).toFixed(1);
            const name = String(file.path ?? '').split('/').pop() ?? '?';
            process.stdout.write(`  [pipeline] ${'TOTAL'.padEnd(14)}: ${ms}ms  (${name})\n`);
          };
        }

        updateConfig({
          vite: {
            plugins: [{
              name: 'astro-math-book-virtual',
              resolveId(id) {
                if (id === VM_MACROS)    return '\0' + VM_MACROS;
                if (id === VM_REGISTRY)  return '\0' + VM_REGISTRY;
                if (id === VM_BIB)       return '\0' + VM_BIB;
                if (id === VM_BIB_HREF)  return '\0' + VM_BIB_HREF;
              },
              load(id) {
                if (id === '\0' + VM_MACROS) {
                  return `export const katexMacros = ${JSON.stringify(katexMacros)};`;
                }
                if (id === '\0' + VM_REGISTRY) {
                  try { return `export default ${readFileSync(getRegistryPath(), 'utf-8')};`; }
                  catch { return 'export default {};'; }
                }
                if (id === '\0' + VM_BIB) {
                  try { return `export default ${readFileSync(getBibPath(), 'utf-8')};`; }
                  catch { return 'export default {};'; }
                }
                if (id === '\0' + VM_BIB_HREF) {
                  return `export default ${JSON.stringify(bibliographyHref)};`;
                }
              },
            }],
          },
          integrations: [
            registryIntegration({ katexMacros, environments, symbols, symbolsSlug, bookSlug, contentDir, chapterBase: urlBase }),
            bibliographyIntegration(),
            mdx({
              remarkPlugins: [
                ...(isDev ? [pipelineStart] : []),
                wrap('section-refs',  remarkSectionRefs),
                [wrap('heading-texts', remarkHeadingTexts), { getRegistryPath }],
                wrap('remark-math',   remarkMath),
                [wrap('equations',    remarkEquations),    { getRegistryPath }],
                [wrap('number-envs',  remarkNumberEnvs),   { getRegistryPath, getChaptersDir, numberedEnvironments, environments }],
              ],
              rehypePlugins: [
                [wrap('katex',     rehypeKatex), { macros: katexMacros, strict: (code) => code === 'newLineInDisplayMode' ? 'ignore' : 'warn' }],
                wrap('code-copy',  rehypeCodeCopy),
                ...(isDev ? [pipelineEnd] : []),
              ],
            }),
            react(),
          ],
        });
      },
    },
  };
}
