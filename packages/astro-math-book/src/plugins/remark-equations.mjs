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
    value: `import { ${name} } from '@/components'`,
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
          source: { type: 'Literal', value: '@/components', raw: "'@/components'" },
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

// Returns true if any row object property has a non-Literal value (e.g. JSX).
// In that case the rows cannot be losslessly serialised to JSON.
function hasNonLiteralRowProps(rowsExpr) {
  if (!rowsExpr || rowsExpr.type !== 'ArrayExpression') return false;
  return rowsExpr.elements.some(el =>
    el?.type === 'ObjectExpression' &&
    el.properties.some(p => p.type === 'Property' && p.value.type !== 'Literal')
  );
}

// Add (or replace) a plain Literal property on an ObjectExpression node.
function injectPropLiteral(objExpr, key, val) {
  objExpr.properties = objExpr.properties.filter(
    p => !(p.type === 'Property' && p.key?.type === 'Identifier' && p.key.name === key)
  );
  objExpr.properties.push({
    type: 'Property', kind: 'init',
    method: false, shorthand: false, computed: false,
    key: { type: 'Identifier', name: key },
    value: { type: 'Literal', value: val, raw: JSON.stringify(val) },
  });
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

    // Walk an estree looking for <Footnote> JSX elements embedded in attribute
    // value expressions (e.g. note={<Footnote/>}). Markers are stored as
    // { kind: 'estree', openingElement } so the numbering step can patch them.
    function walkEstreeForFootnotes(estNode, markers) {
      if (!estNode || typeof estNode !== 'object') return;
      if (Array.isArray(estNode)) {
        for (const item of estNode) walkEstreeForFootnotes(item, markers);
        return;
      }
      if (estNode.type === 'JSXElement') {
        const name = estNode.openingElement?.name;
        if (name?.type === 'JSXIdentifier' && name.name === 'Footnote') {
          markers.push({ kind: 'estree', openingElement: estNode.openingElement });
          return;
        }
      }
      for (const key of Object.keys(estNode)) {
        if (key === 'loc' || key === 'start' || key === 'end' || key === 'range' || key === 'parent') continue;
        const val = estNode[key];
        if (val && typeof val === 'object') walkEstreeForFootnotes(val, markers);
      }
    }

    // Single pass in document order: handles flow elements, text elements, and
    // <Footnote> markers hidden inside JSX attribute value expressions.
    visit(tree, (node) => {
      if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') return;
      collectCite(node);
      if (node.name === 'Footnote') { footnoteMarkers.push({ kind: 'unist', node }); return; }
      if (node.name === 'FootnoteBody') { footnoteBodies.push(node); return; }
      // Scan attribute value expressions for embedded <Footnote> elements.
      for (const attr of node.attributes ?? []) {
        if (attr.value?.type === 'mdxJsxAttributeValueExpression') {
          walkEstreeForFootnotes(attr.value.data?.estree, footnoteMarkers);
        }
      }
      if (node.type !== 'mdxJsxFlowElement' || node.name !== 'AnnotatedAlign') return;
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
      annotAligns.push({ node, rows, updated, rowsExpr });
    });

    // Extract the id string from either a unist JSX node or an estree JSXOpeningElement.
    function getAttrId(marker) {
      if (marker.kind === 'estree') {
        const idAttr = marker.openingElement?.attributes?.find(
          a => a.type === 'JSXAttribute' && a.name?.name === 'id'
        );
        return idAttr?.value?.type === 'Literal' ? idAttr.value.value : null;
      }
      const node = marker.node ?? marker;
      const attr = node.attributes?.find(a => a.name === 'id');
      return typeof attr?.value === 'string' ? attr.value : null;
    }

    // Inject a number prop into either a unist JSX node or an estree JSXOpeningElement.
    function setNumber(marker, n) {
      if (marker.kind === 'estree') {
        const oe = marker.openingElement;
        oe.attributes = (oe.attributes ?? []).filter(
          a => !(a.type === 'JSXAttribute' && a.name?.name === 'number')
        );
        oe.attributes.push({
          type: 'JSXAttribute',
          name: { type: 'JSXIdentifier', name: 'number' },
          value: { type: 'JSXExpressionContainer', expression: { type: 'Literal', value: n, raw: String(n) } },
        });
        return;
      }
      const node = marker.node ?? marker;
      node.attributes = (node.attributes ?? []).filter(a => a.name !== 'number');
      node.attributes.push(exprAttr('number', n));
    }

    // Assign display numbers to markers in document order.
    for (let i = 0; i < footnoteMarkers.length; i++) {
      setNumber(footnoteMarkers[i], i + 1);
    }

    // Build id→number map from markers, and collect the numbers of un-id'd markers.
    const fnIdToNumber = new Map();
    const unidMarkerNumbers = [];
    for (let i = 0; i < footnoteMarkers.length; i++) {
      const id = getAttrId(footnoteMarkers[i]);
      if (id) fnIdToNumber.set(id, i + 1);
      else unidMarkerNumbers.push(i + 1);
    }

    // Assign numbers to bodies: id-matched first, then positional for un-id'd.
    let unidBodyIndex = 0;
    for (const node of footnoteBodies) {
      const id = getAttrId(node);
      const n = (id && fnIdToNumber.has(id)) ? fnIdToNumber.get(id) : (unidMarkerNumbers[unidBodyIndex++] ?? 0);
      setNumber(node, n);
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

    for (const { node, rows, updated, rowsExpr } of annotAligns) {
      const idx = node.attributes.findIndex(a => a.name === 'rows');
      if (idx < 0) continue;
      if (hasNonLiteralRowProps(rowsExpr)) {
        // Preserve the original ArrayExpression (which contains JSX values).
        // Only inject number/label into rows whose id was resolved.
        for (let i = 0; i < updated.length; i++) {
          if (updated[i] === rows[i]) continue;
          const objExpr = rowsExpr.elements[i];
          if (!objExpr || objExpr.type !== 'ObjectExpression') continue;
          if (updated[i].number != null) injectPropLiteral(objExpr, 'number', updated[i].number);
          if (updated[i].label  != null) injectPropLiteral(objExpr, 'label',  updated[i].label);
        }
      } else {
        node.attributes[idx] = exprAttr('rows', updated);
      }
    }
  };
}
