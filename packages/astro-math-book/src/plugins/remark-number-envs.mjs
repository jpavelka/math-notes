import { readFileSync } from 'node:fs';
import { relative, basename } from 'node:path';
import { visit } from 'unist-util-visit';

function idFromAttrs(attrs) {
  const a = attrs.find((a) => a.name === 'id');
  return typeof a?.value === 'string' ? a.value : null;
}

function numberAttr(num) {
  const raw = JSON.stringify(num);
  return {
    type: 'mdxJsxAttribute',
    name: 'number',
    value: {
      type: 'mdxJsxAttributeValueExpression',
      value: raw,
      data: {
        estree: {
          type: 'Program',
          body: [{ type: 'ExpressionStatement', expression: { type: 'Literal', value: num, raw } }],
          sourceType: 'module',
        },
      },
    },
  };
}

/**
 * Injects a `number` prop onto each numbered math environment.
 * Accepts { getRegistryPath, numberedEnvironments, environments }.
 */
export function remarkNumberEnvs({ getRegistryPath, getChaptersDir, numberedEnvironments, environments = [] } = {}) {
  const DEFAULT = ['Theorem', 'Definition', 'Lemma', 'Corollary', 'Remark', 'Figure', 'Table', 'YouTubeEmbed', 'Algorithm'];
  const NUMBERED = new Set([
    ...(numberedEnvironments ?? DEFAULT),
    ...environments.map(e => e.name),
  ]);

  function getRegistry() {
    if (!getRegistryPath) return {};
    try { return JSON.parse(readFileSync(getRegistryPath(), 'utf-8')); }
    catch { return {}; }
  }

  return (tree, vfile) => {
    const registry = getRegistry();
    const filePath = vfile?.path ?? vfile?.history?.[0] ?? '';
    const chaptersDir = getChaptersDir?.();
    const slug = (chaptersDir && filePath)
      ? relative(chaptersDir, filePath).replace(/\.mdx$/i, '').toLowerCase()
      : basename(filePath, '.mdx').toLowerCase();

    let envIndex = 0;
    let fallbackCount = 0;

    visit(tree, 'mdxJsxFlowElement', (node) => {
      if (!NUMBERED.has(node.name)) return;
      const thisIdx = envIndex++;
      if (node.attributes.some((a) => a.name === 'number')) return;

      const id = idFromAttrs(node.attributes);
      const lookupId = id ?? `__auto-${slug}-${thisIdx}`;
      let num;
      if (registry[lookupId]) {
        num = registry[lookupId].number;
      } else {
        fallbackCount++;
        num = String(fallbackCount);
      }
      node.attributes.push(numberAttr(num));
    });
  };
}
