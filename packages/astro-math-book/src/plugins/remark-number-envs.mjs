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
  const DEFAULT = ['Theorem', 'Definition', 'Lemma', 'Corollary', 'Remark', 'Figure', 'Table', 'YouTubeEmbed', 'Algorithm', 'Problem'];
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
      if (node.name === 'AnnotatedAlign') {
        // remark-equations (which runs before this plugin) replaces the rows
        // ArrayExpression with exprAttr('rows', plainArray) — a Literal node
        // whose .value is the actual JS array. Row-level numbers for subequations
        // are already injected by remark-equations. Here we only need to handle
        // the block-id-only case: no row has a number yet, so show the block
        // number on the last row.
        const blockIdAttr = node.attributes?.find(a => a.name === 'id');
        const blockId = typeof blockIdAttr?.value === 'string' ? blockIdAttr.value : null;
        if (!blockId || !registry[blockId]) return;

        const rowsAttr = node.attributes?.find(a => a.name === 'rows');
        const expr = rowsAttr?.value?.data?.estree?.body?.[0]?.expression;

        const blockNum = registry[blockId].number;
        if (blockNum == null) return;

        if (expr?.type === 'Literal' && Array.isArray(expr.value)) {
          // Normal path: remark-equations already serialised rows to a JSON Literal.
          const rows = expr.value;
          if (rows.some(r => r?.number != null)) return;
          const midIdx = Math.floor((rows.length - 1) / 2);
          const lastRow = rows[midIdx];
          if (!lastRow) return;
          lastRow.number = String(blockNum);
          const updated = JSON.stringify(rows);
          expr.raw = updated;
          rowsAttr.value.value = updated;
        } else if (expr?.type === 'ArrayExpression') {
          // JSX-annotation path: remark-equations left the original ArrayExpression
          // intact to preserve non-serialisable values (e.g. JSX fragments).
          const hasNumber = expr.elements.some(el =>
            el?.type === 'ObjectExpression' &&
            el.properties.some(p => p.type === 'Property' && p.key?.name === 'number')
          );
          if (hasNumber) return;
          const midIdx = Math.floor((expr.elements.length - 1) / 2);
          const midEl = expr.elements[midIdx];
          if (!midEl || midEl.type !== 'ObjectExpression') return;
          midEl.properties = midEl.properties.filter(
            p => !(p.type === 'Property' && p.key?.name === 'number')
          );
          midEl.properties.push({
            type: 'Property', kind: 'init',
            method: false, shorthand: false, computed: false,
            key: { type: 'Identifier', name: 'number' },
            value: { type: 'Literal', value: String(blockNum), raw: JSON.stringify(String(blockNum)) },
          });
        }
        return;
      }

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
