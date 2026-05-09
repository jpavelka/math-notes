import { readFileSync } from 'node:fs';
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
 * Accepts { getRegistryPath, numberedEnvironments }.
 */
export function remarkNumberEnvs({ getRegistryPath, numberedEnvironments } = {}) {
  const NUMBERED = new Set(numberedEnvironments ?? ['Theorem', 'Definition', 'Lemma', 'Corollary', 'Remark', 'Figure', 'Table']);

  function getRegistry() {
    if (!getRegistryPath) return {};
    try { return JSON.parse(readFileSync(getRegistryPath(), 'utf-8')); }
    catch { return {}; }
  }

  return (tree) => {
    const registry = getRegistry();
    const counters = {};

    visit(tree, 'mdxJsxFlowElement', (node) => {
      if (!NUMBERED.has(node.name)) return;
      if (node.attributes.some((a) => a.name === 'number')) return;

      const id = idFromAttrs(node.attributes);
      let num;
      if (id && registry[id]) {
        num = registry[id].number;
      } else {
        const t = node.name;
        counters[t] = (counters[t] ?? 0) + 1;
        num = String(counters[t]);
      }
      node.attributes.push(numberAttr(num));
    });
  };
}
