import { readFileSync } from 'node:fs';
import { visit } from 'unist-util-visit';

const LABEL_RE = /\{#([\w:.-]+)(?:\|([^}]*))?\}/;

function strAttr(name, value) {
  return { type: 'mdxJsxAttribute', name, value };
}

function exprAttr(name, jsValue) {
  const raw = JSON.stringify(jsValue);
  return {
    type: 'mdxJsxAttribute',
    name,
    value: {
      type: 'mdxJsxAttributeValueExpression',
      value: raw,
      data: {
        estree: {
          type: 'Program',
          body: [{ type: 'ExpressionStatement', expression: { type: 'Literal', value: jsValue, raw } }],
          sourceType: 'module',
        },
      },
    },
  };
}

function strArrayAttr(name, arr) {
  return {
    type: 'mdxJsxAttribute',
    name,
    value: {
      type: 'mdxJsxAttributeValueExpression',
      value: JSON.stringify(arr),
      data: {
        estree: {
          type: 'Program',
          body: [{
            type: 'ExpressionStatement',
            expression: {
              type: 'ArrayExpression',
              elements: arr.map(s => ({ type: 'Literal', value: s, raw: JSON.stringify(s) })),
            },
          }],
          sourceType: 'module',
        },
      },
    },
  };
}

function makeImportNode(name) {
  return {
    type: 'mdxjsEsm',
    value: `import { ${name} } from '@/components/math'`,
    data: {
      estree: {
        type: 'Program',
        body: [{
          type: 'ImportDeclaration',
          specifiers: [{
            type: 'ImportSpecifier',
            imported: { type: 'Identifier', name },
            local: { type: 'Identifier', name },
          }],
          source: { type: 'Literal', value: '@/components/math', raw: "'@/components/math'" },
        }],
        sourceType: 'module',
      },
    },
  };
}

function stripEnvWrapper(body) {
  const m = body.match(/^\s*\\begin\{([\w*]+)\}([\s\S]*?)\\end\{\1\}\s*$/);
  if (!m) return null;
  return { envName: m[1], inner: m[2] };
}

function buildSubEquations(body, registry) {
  const allLabels = body.match(/\{#[\w:.-]+(?:\|[^}]*)?\}/g) ?? [];
  if (allLabels.length === 0) return null;

  const wrapped = stripEnvWrapper(body.trim());
  const inner = wrapped ? wrapped.inner : body;

  const segments = inner.split('\\\\');

  const isMultiLine = segments.length > 1;
  if (allLabels.length < 2 && !isMultiLine) return null;

  const rows = segments.map((seg) => {
    const labelMatch = seg.match(/\{#([\w:.-]+)(?:\|([^}]*))?\}/);
    const clean = seg.replace(/\{#[\w:.-]+(?:\|[^}]*)?\}/g, '');
    const ampIdx = clean.indexOf('&');
    const left = ampIdx >= 0 ? clean.slice(0, ampIdx).trim() : clean.trim();
    const right = ampIdx >= 0 ? clean.slice(ampIdx + 1).trim() : '';
    if (labelMatch) {
      const id = labelMatch[1];
      const number = registry[id]?.number ?? '?';
      const label = labelMatch[2]?.trim() || registry[id]?.label;
      return { id, number, ...(label ? { label } : {}), left, right };
    }
    return { left, right };
  });

  return { rows };
}

// Minimal evaluator for the rows={[...]} attribute in <AnnotatedAlign>.
// Handles plain object/array/string literals — enough for typical MDX usage.
function evalRows(expr) {
  if (!expr || expr.type !== 'ArrayExpression') return null;
  return expr.elements.map(el => {
    if (!el || el.type !== 'ObjectExpression') return {};
    const obj = {};
    for (const prop of el.properties) {
      if (prop.type !== 'Property') continue;
      const key = prop.key.type === 'Identifier' ? prop.key.name : String(prop.key.value);
      if (prop.value.type === 'Literal') obj[key] = prop.value.value;
    }
    return obj;
  });
}

/**
 * Transforms display math blocks tagged with {#eq:label} into <Equation> JSX.
 * Accepts { getRegistryPath } — a function returning the path to registry.json.
 * Syntax: $$ {#eq:label}
 */
export function remarkEquations({ getRegistryPath } = {}) {
  function getRegistry() {
    if (!getRegistryPath) return {};
    try { return JSON.parse(readFileSync(getRegistryPath(), 'utf-8')); }
    catch { return {}; }
  }

  return (tree) => {
    const registry = getRegistry();
    let localCount = 0;
    const single = [];
    const subEq = [];
    const annotAligns = [];
    const citeIds = new Set();
    const footnoteMarkers = [];
    const footnoteBodies = [];

    visit(tree, 'math', (node) => {
      const m = (node.meta ?? '').match(LABEL_RE);
      if (m) {
        const id = m[1];
        const num = registry[id]?.number ?? String(++localCount);
        const label = m[2]?.trim() || registry[id]?.label;
        single.push({ node, id, num, label });
        return;
      }
      const result = buildSubEquations(node.value, registry);
      if (result) subEq.push({ node, rows: result.rows });
    });

    function collectCite(node) {
      if (node.name === 'Cite') {
        const idAttr = node.attributes?.find(a => a.name === 'id');
        if (idAttr && typeof idAttr.value === 'string') citeIds.add(idAttr.value);
      }
    }

    visit(tree, 'mdxJsxFlowElement', (node) => {
      collectCite(node);
      if (node.name === 'Footnote') { footnoteMarkers.push(node); return; }
      if (node.name === 'FootnoteBody') { footnoteBodies.push(node); return; }
      if (node.name !== 'AnnotatedAlign') return;
      const rowsAttr = node.attributes?.find(a => a.name === 'rows');
      if (!rowsAttr) return;
      const rowsExpr = rowsAttr.value?.data?.estree?.body?.[0]?.expression;
      const rows = evalRows(rowsExpr);
      if (!rows) return;
      const updated = rows.map(row => {
        if (!row?.id) return row;
        const entry = registry[row.id];
        if (!entry) return row;
        return { ...row, number: String(entry.number), ...(entry.label ? { label: entry.label } : {}) };
      });
      annotAligns.push({ node, updated });
    });

    visit(tree, 'mdxJsxTextElement', (node) => {
      collectCite(node);
      if (node.name === 'Footnote') footnoteMarkers.push(node);
    });

    for (let i = 0; i < footnoteMarkers.length; i++) {
      const node = footnoteMarkers[i];
      node.attributes = (node.attributes ?? []).filter(a => a.name !== 'number');
      node.attributes.push(exprAttr('number', i + 1));
    }

    for (let i = 0; i < footnoteBodies.length; i++) {
      const node = footnoteBodies[i];
      node.attributes = (node.attributes ?? []).filter(a => a.name !== 'number');
      node.attributes.push(exprAttr('number', i + 1));
    }

    // Remove any explicit <Bibliography /> and a trailing "## References" heading;
    // they will be re-appended automatically below when citeIds are present.
    tree.children = tree.children.filter(
      n => !(n.type === 'mdxJsxFlowElement' && n.name === 'Bibliography')
    );
    const lastChild = tree.children[tree.children.length - 1];
    if (
      lastChild?.type === 'heading' &&
      lastChild?.children?.[0]?.value === 'References'
    ) {
      tree.children.pop();
    }

    if (citeIds.size > 0) {
      const ids = [...citeIds].sort();
      const hasBibImport = tree.children.some(
        c => c.type === 'mdxjsEsm' && c.value?.includes('Bibliography')
      );
      if (!hasBibImport) tree.children.unshift(makeImportNode('Bibliography'));
      tree.children.push({
        type: 'heading',
        depth: 2,
        children: [{ type: 'text', value: 'References' }],
      });
      tree.children.push({
        type: 'mdxJsxFlowElement',
        name: 'Bibliography',
        attributes: [strArrayAttr('citeIds', ids)],
        children: [],
      });
    }

    if (single.length === 0 && subEq.length === 0 && annotAligns.length === 0) return;

    if (single.length > 0) {
      const hasImport = tree.children.some(
        (c) => c.type === 'mdxjsEsm' && c.value?.includes('Equation'),
      );
      if (!hasImport) tree.children.unshift(makeImportNode('Equation'));
    }

    if (subEq.length > 0) {
      const hasImport = tree.children.some(
        (c) => c.type === 'mdxjsEsm' && c.value?.includes('SubEquations'),
      );
      if (!hasImport) tree.children.unshift(makeImportNode('SubEquations'));
    }

    for (const { node, id, num, label } of single) {
      const math = node.value.trim();
      node.type = 'mdxJsxFlowElement';
      node.name = 'Equation';
      node.attributes = [
        strAttr('id', id),
        exprAttr('number', num),
        ...(label ? [strAttr('label', label)] : []),
        exprAttr('math', math),
      ];
      node.children = [];
    }

    for (const { node, rows } of subEq) {
      node.type = 'mdxJsxFlowElement';
      node.name = 'SubEquations';
      node.attributes = [exprAttr('rows', rows)];
      node.children = [];
    }

    for (const { node, updated } of annotAligns) {
      const idx = node.attributes.findIndex(a => a.name === 'rows');
      if (idx >= 0) node.attributes[idx] = exprAttr('rows', updated);
    }
  };
}
