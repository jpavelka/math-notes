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

const VM_MACROS   = 'virtual:astro-math-book/katex-macros';
const VM_REGISTRY = 'virtual:astro-math-book/registry';
const VM_BIB      = 'virtual:astro-math-book/bibliography';

/**
 * @param {{ katexMacros?: Record<string,string>, numberedEnvironments?: string[] }} [options]
 * @returns {import('astro').AstroIntegration}
 */
export function mathBook(options = {}) {
  const { katexMacros = {}, numberedEnvironments } = options;
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
        const getRegistryPath = () => join(projectRoot, 'src/lib/registry.json');
        const getBibPath      = () => join(projectRoot, 'src/lib/bibliography.json');

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
            registryIntegration({ katexMacros }),
            bibliographyIntegration(),
            mdx({
              remarkPlugins: [
                remarkSectionRefs,
                remarkHeadingTexts,
                remarkMath,
                [remarkEquations, { getRegistryPath }],
                [remarkNumberEnvs, { getRegistryPath, numberedEnvironments }],
              ],
              rehypePlugins: [[rehypeKatex, { macros: katexMacros }]],
            }),
            react(),
          ],
        });
      },
    },
  };
}
