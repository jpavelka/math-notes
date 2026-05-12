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

const VM_MACROS   = 'virtual:astro-math-book/katex-macros';
const VM_REGISTRY = 'virtual:astro-math-book/registry';
const VM_BIB      = 'virtual:astro-math-book/bibliography';

/**
 * @typedef {{
 *   name: string,
 *   type?: string,
 *   kind?: 'float',
 *   collectContent?: (node: any, helpers: { getAttrString: (attrs: any[], name: string) => string | null, nodesToHtml: (nodes: any[]) => string }) => { title?: string, contentHTML: string }
 * }} EnvDescriptor
 */

/**
 * @param {{ katexMacros?: Record<string,string>, numberedEnvironments?: string[], environments?: EnvDescriptor[], bookSlug?: string, contentDir?: string, urlBase?: string }} [options]
 * @returns {import('astro').AstroIntegration}
 */
export function mathBook(options = {}) {
  const { katexMacros = {}, numberedEnvironments, environments = [], bookSlug = 'chapters', contentDir, urlBase } = options;
  let projectRoot = '';

  return {
    name: 'astro-math-book',
    hooks: {
      'astro:config:done': ({ config }) => {
        projectRoot = config.root instanceof URL
          ? fileURLToPath(config.root)
          : String(config.root);
      },
      'astro:config:setup': ({ updateConfig }) => {
        // Lazy path — safe to use in load/build hooks because projectRoot
        // is set by astro:config:done before Vite buildStart runs.
        const getRegistryPath = () => join(projectRoot, '.astro/registry.json');
        const getBibPath      = () => join(projectRoot, '.astro/bibliography.json');

        updateConfig({
          vite: {
            plugins: [{
              name: 'astro-math-book-virtual',
              resolveId(id) {
                if (id === VM_MACROS)   return '\0' + VM_MACROS;
                if (id === VM_REGISTRY) return '\0' + VM_REGISTRY;
                if (id === VM_BIB)      return '\0' + VM_BIB;
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
              },
            }],
          },
          integrations: [
            registryIntegration({ katexMacros, environments, bookSlug, contentDir, chapterBase: urlBase }),
            bibliographyIntegration(),
            mdx({
              remarkPlugins: [
                remarkSectionRefs,
                remarkHeadingTexts,
                remarkMath,
                [remarkEquations, { getRegistryPath }],
                [remarkNumberEnvs, { getRegistryPath, numberedEnvironments, environments }],
              ],
              rehypePlugins: [[rehypeKatex, { macros: katexMacros }], rehypeCodeCopy],
            }),
            react(),
          ],
        });
      },
    },
  };
}
