/**
 * Astro integration: walks all MDX files at build start, assigns
 * globally-consistent chapter.localCount numbers, serialises each
 * labelled item's body to HTML, and writes src/lib/registry.json.
 *
 * Must run before MDX compilation so the remark plugins can read the numbers.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import katex from 'katex';

// ── Constants ────────────────────────────────────────────────────────────────

const NUMBERED_ENVS = new Set(['Theorem', 'Definition', 'Lemma', 'Corollary', 'Remark', 'Figure', 'Table', 'YouTubeEmbed']);
const LABEL_RE = /\{#([\w:.-]+)(?:\|([^}]*))?\}/;

// ── Filesystem helpers ───────────────────────────────────────────────────────

function findMdxFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findMdxFiles(full));
    else if (entry.name.endsWith('.mdx')) results.push(full);
  }
  return results;
}

// ── Frontmatter parsing ──────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const yaml = m[1];
  const chapterRaw = yaml.match(/^chapter:\s*["']?([A-Za-z0-9]+)["']?/m)?.[1];
  const chapter = chapterRaw == null ? null
    : /^\d+$/.test(chapterRaw) ? parseInt(chapterRaw)
    : chapterRaw;
  const title = yaml.match(/^title:\s*["']?(.*?)["']?\s*$/m)?.[1];
  return {
    chapter,
    title: title?.trim() ?? null,
  };
}

// ── Content → HTML serialiser ────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function makeSerializer(katexMacros) {
  function nodesToHtml(nodes, svg = false) {
    return (nodes ?? []).map(n => nodeToHtml(n, svg)).join('');
  }

  function nodeToHtml(node, svg = false) {
    switch (node.type) {
      // Inside SVG, skip the <p> wrapper so <text> elements aren't trapped in block elements
      case 'paragraph': return svg ? nodesToHtml(node.children, true) : `<p>${nodesToHtml(node.children)}</p>`;
      case 'text': return esc(node.value);
      case 'inlineMath': return katex.renderToString(node.value, { throwOnError: false, macros: katexMacros });
      case 'math': return katex.renderToString(node.value, { displayMode: true, throwOnError: false, macros: katexMacros });
      case 'strong': return `<strong>${nodesToHtml(node.children)}</strong>`;
      case 'emphasis': return `<em>${nodesToHtml(node.children)}</em>`;
      case 'inlineCode': return `<code>${esc(node.value)}</code>`;
      case 'link': return `<a href="${esc(node.url)}">${nodesToHtml(node.children)}</a>`;
      // Tables: use <span> with CSS table roles to stay valid inside a <span> tooltip
      case 'table': {
        const [head, ...body] = node.children ?? [];
        const ths = (head?.children ?? []).map(c => `<span class="tt-th">${nodesToHtml(c.children)}</span>`).join('');
        const rows = body.map(row => {
          const tds = (row.children ?? []).map(c => `<span class="tt-td">${nodesToHtml(c.children)}</span>`).join('');
          return `<span class="tt-tr">${tds}</span>`;
        }).join('');
        return `<span class="tt-table"><span class="tt-thead"><span class="tt-tr">${ths}</span></span><span class="tt-tbody">${rows}</span></span>`;
      }
      case 'tableRow': return ''; // handled inside 'table'
      case 'tableCell': return ''; // handled inside 'table'
      case 'image':
        return `<img src="${esc(node.url)}" alt="${esc(node.alt ?? '')}" style="max-width:100%;height:auto">`;
      case 'mdxJsxTextElement':
      case 'mdxJsxFlowElement': {
        if (node.name === 'Ref') {
          const refId = getAttrString(node.attributes, 'id');
          if (refId) return `\x00REF:${refId}\x00`;
        }
        // Serialize lowercase (HTML/SVG) elements; skip PascalCase React components
        if (node.name && /^[a-z]/.test(node.name)) {
          const attrs = (node.attributes ?? [])
            .map(a => {
              if (a.type !== 'mdxJsxAttribute') return '';
              const attrName = svgAttrName(a.name);
              if (attrName === 'key') return '';
              if (a.value === null || a.value === undefined) return attrName;
              if (typeof a.value === 'string') return `${attrName}="${esc(a.value)}"`;
              const expr = a.value?.data?.estree?.body?.[0]?.expression;
              if (!expr) return '';
              if (attrName === 'style' && expr.type === 'ObjectExpression') {
                const css = expr.properties.map(p => {
                  const k = p.key.type === 'Identifier' ? p.key.name : String(p.key.value);
                  return `${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}:${evalEstreeExpr(p.value, {})}`;
                }).join(';');
                return `style="${esc(css)}"`;
              }
              const val = evalEstreeExpr(expr, {});
              if (val == null) return '';
              if (typeof val === 'boolean') return val ? attrName : '';
              return `${attrName}="${esc(String(val))}"`;
            })
            .filter(Boolean)
            .join(' ');
          const open = `<${node.name}${attrs ? ' ' + attrs : ''}>`;
          if (VOID_TAGS.has(node.name)) return open;
          const childSvg = svg || node.name === 'svg';
          return `${open}${nodesToHtml(node.children, childSvg)}</${node.name}>`;
        }
        return ''; // skip PascalCase components (PrintFallback, etc.)
      }
      case 'mdxJsxFlowExpression':
      case 'mdxFlowExpression': {
        const expr = node.data?.estree?.body?.[0]?.expression;
        if (!expr || expr.type === 'JSXEmptyExpression') return '';
        const v = evalEstreeExpr(expr, {});
        return v != null ? String(v) : '';
      }
      default: return node.children ? nodesToHtml(node.children, svg) : '';
    }
  }

  return { nodesToHtml, nodeToHtml };
}

// ── JSX attribute helpers ────────────────────────────────────────────────────

function getAttrString(attrs, name) {
  const a = attrs?.find((a) => a.name === name);
  if (!a) return null;
  if (typeof a.value === 'string') return a.value;
  // Expression attribute — try to extract literal value
  const lit = a.value?.data?.estree?.body?.[0]?.expression;
  if (lit?.type === 'Literal') return String(lit.value);
  return a.value?.value ?? null;
}

// ── SVG/HTML attribute name helpers ─────────────────────────────────────────

// camelCase SVG presentation attributes that must NOT be lowercased
const SVG_CAMEL_PRESERVE = new Set([
  'viewBox','gradientTransform','patternTransform','gradientUnits','patternUnits',
  'clipPathUnits','markerUnits','spreadMethod','preserveAspectRatio','filterUnits',
  'primitiveUnits','refX','refY','markerWidth','markerHeight',
  'maskContentUnits','maskUnits','textLength','lengthAdjust',
  'numOctaves','baseFrequency','stdDeviation',
]);

function svgAttrName(name) {
  if (name === 'className') return 'class';
  if (name === 'htmlFor') return 'for';
  if (name === 'xlinkHref') return 'xlink:href';
  if (SVG_CAMEL_PRESERVE.has(name)) return name;
  return name.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
}

// ── Estree expression evaluator (for JSX in SVG figures) ─────────────────────

function evalEstreeExpr(node, scope) {
  if (!node) return undefined;
  switch (node.type) {
    case 'Literal': return node.value;
    case 'Identifier': return Object.prototype.hasOwnProperty.call(scope, node.name) ? scope[node.name] : undefined;
    case 'BinaryExpression': {
      const l = evalEstreeExpr(node.left, scope), r = evalEstreeExpr(node.right, scope);
      switch (node.operator) {
        case '+': return l + r; case '-': return l - r;
        case '*': return l * r; case '/': return l / r;
        case '>=': return l >= r; case '<=': return l <= r;
        case '>': return l > r; case '<': return l < r;
        case '===': case '==': return l === r;
        case '!==': case '!=': return l !== r;
        default: return undefined;
      }
    }
    case 'ConditionalExpression':
      return evalEstreeExpr(node.test, scope)
        ? evalEstreeExpr(node.consequent, scope)
        : evalEstreeExpr(node.alternate, scope);
    case 'UnaryExpression': {
      const v = evalEstreeExpr(node.argument, scope);
      return node.operator === '-' ? -v : node.operator === '!' ? !v : undefined;
    }
    case 'ArrayExpression': return node.elements.map(e => e ? evalEstreeExpr(e, scope) : undefined);
    case 'ObjectExpression': {
      const obj = {};
      for (const p of node.properties) {
        const k = p.key.type === 'Identifier' ? p.key.name : String(p.key.value);
        obj[k] = evalEstreeExpr(p.value, scope);
      }
      return obj;
    }
    case 'MemberExpression': {
      const obj = evalEstreeExpr(node.object, scope);
      const key = node.computed ? evalEstreeExpr(node.property, scope) : node.property.name;
      return obj?.[key];
    }
    case 'CallExpression': {
      const { callee } = node;
      if (callee.type === 'MemberExpression' && !callee.computed && callee.property.name === 'map') {
        const arr = evalEstreeExpr(callee.object, scope);
        if (Array.isArray(arr) && node.arguments.length > 0)
          return arr.map((el, i) => evalEstreeCall(node.arguments[0], [el, i], scope)).join('');
      }
      return '';
    }
    case 'JSXElement': return evalEstreeJSX(node, scope);
    case 'JSXFragment': return (node.children ?? []).map(c => evalEstreeJSXChild(c, scope)).join('');
    default: return undefined;
  }
}

function evalEstreeCall(fn, args, scope) {
  if (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression') return '';
  const s = { ...scope };
  for (let i = 0; i < fn.params.length; i++) {
    const p = fn.params[i], a = args[i];
    if (p.type === 'Identifier') { s[p.name] = a; }
    else if (p.type === 'ArrayPattern') {
      const arr = Array.isArray(a) ? a : [];
      p.elements.forEach((e, j) => { if (e?.type === 'Identifier') s[e.name] = arr[j]; });
    } else if (p.type === 'ObjectPattern') {
      const obj = a ?? {};
      for (const prop of p.properties)
        if (prop.key?.type === 'Identifier') s[prop.key.name] = obj[prop.key.name];
    }
  }
  if (fn.body.type === 'BlockStatement') {
    for (const stmt of fn.body.body)
      if (stmt.type === 'ReturnStatement') { const v = evalEstreeExpr(stmt.argument, s); return v != null ? String(v) : ''; }
    return '';
  }
  const v = evalEstreeExpr(fn.body, s);
  return v != null ? String(v) : '';
}

function evalEstreeJSXChild(child, scope) {
  switch (child.type) {
    case 'JSXElement': return evalEstreeJSX(child, scope);
    case 'JSXFragment': return (child.children ?? []).map(c => evalEstreeJSXChild(c, scope)).join('');
    case 'JSXText': { const t = child.value.replace(/\n\s*/g, ' ').trim(); return t ? esc(t) : ''; }
    case 'JSXExpressionContainer': {
      const expr = child.expression;
      if (!expr || expr.type === 'JSXEmptyExpression') return '';
      if (expr.type === 'JSXElement') return evalEstreeJSX(expr, scope);
      // .map() and other calls that produce HTML
      if (expr.type === 'CallExpression') { const v = evalEstreeExpr(expr, scope); return v != null ? String(v) : ''; }
      const v = evalEstreeExpr(expr, scope);
      return v != null ? esc(String(v)) : '';
    }
    default: return '';
  }
}

const VOID_TAGS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

function evalEstreeJSX(jsxEl, scope) {
  const tagName = jsxEl.openingElement.name.name ?? '';
  // Skip PascalCase React components but still render their children
  if (/^[A-Z]/.test(tagName)) return (jsxEl.children ?? []).map(c => evalEstreeJSXChild(c, scope)).join('');
  const attrsStr = (jsxEl.openingElement.attributes ?? []).map(attr => {
    if (attr.type !== 'JSXAttribute') return '';
    const rawName = attr.name.type === 'JSXNamespacedName'
      ? `${attr.name.namespace.name}:${attr.name.name.name}` : attr.name.name;
    const attrName = svgAttrName(rawName);
    if (attrName === 'key') return '';
    if (attr.value === null) return attrName;
    if (attr.value.type === 'Literal') return `${attrName}="${esc(String(attr.value.value))}"`;
    if (attr.value.type === 'JSXExpressionContainer') {
      const expr = attr.value.expression;
      if (!expr || expr.type === 'JSXEmptyExpression') return '';
      if (attrName === 'style' && expr.type === 'ObjectExpression') {
        const css = expr.properties.map(p => {
          const k = p.key.type === 'Identifier' ? p.key.name : String(p.key.value);
          return `${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}:${evalEstreeExpr(p.value, scope)}`;
        }).join(';');
        return `style="${esc(css)}"`;
      }
      const v = evalEstreeExpr(expr, scope);
      if (v == null) return '';
      if (typeof v === 'boolean') return v ? attrName : '';
      return `${attrName}="${esc(String(v))}"`;
    }
    return '';
  }).filter(Boolean).join(' ');
  if (jsxEl.openingElement.selfClosing || VOID_TAGS.has(tagName))
    return `<${tagName}${attrsStr ? ' ' + attrsStr : ''} />`;
  const content = (jsxEl.children ?? []).map(c => evalEstreeJSXChild(c, scope)).join('');
  return `<${tagName}${attrsStr ? ' ' + attrsStr : ''}>${content}</${tagName}>`;
}

// ── Heading text extractor ───────────────────────────────────────────────────

function headingToText(children) {
  return (children ?? []).map(c => {
    if (c.type === 'text') return c.value;
    if (c.type === 'inlineMath') return `$${c.value}$`;
    return c.children ? headingToText(c.children) : '';
  }).join('');
}

// ── Item collection ──────────────────────────────────────────────────────────

const FLOAT_ENVS = new Set(['Figure', 'Table']);
const SECTION_COMMENT_RE = /^\s*\/\*\s*#?([\w:.-]+)\s*\*\/\s*$/;

function collectItems(tree, katexMacros) {
  const { nodesToHtml } = makeSerializer(katexMacros);
  const items = [];

  visit(tree, (node) => {
    if (node.type === 'mdxJsxFlowElement' && NUMBERED_ENVS.has(node.name)) {
      const id = getAttrString(node.attributes, 'id');
      if (!id) return;
      if (node.name === 'YouTubeEmbed') {
        const videoId = getAttrString(node.attributes, 'videoId');
        const caption = getAttrString(node.attributes, 'caption');
        const thumbHTML = videoId
          ? `<img src="https://img.youtube.com/vi/${esc(videoId)}/hqdefault.jpg" alt="${esc(caption ?? 'Video')}" style="max-width:100%;height:auto">`
          : '';
        items.push({ id, type: 'Video', title: caption ?? undefined, contentHTML: thumbHTML });
      } else if (FLOAT_ENVS.has(node.name)) {
        const caption = getAttrString(node.attributes, 'caption');
        items.push({
          id,
          type: node.name,
          title: caption ?? undefined,
          contentHTML: nodesToHtml(node.children),
        });
      } else {
        items.push({
          id,
          type: node.name,
          title: getAttrString(node.attributes, 'title') ?? undefined,
          contentHTML: nodesToHtml(node.children),
        });
      }
    } else if (node.type === 'mdxJsxFlowElement' && node.name === 'AnnotatedAlign') {
      const rowsAttr = node.attributes?.find(a => a.name === 'rows');
      if (!rowsAttr) return;
      const rowsExpr = rowsAttr.value?.data?.estree?.body?.[0]?.expression;
      if (!rowsExpr) return;
      const rows = evalEstreeExpr(rowsExpr, {});
      if (!Array.isArray(rows)) return;
      for (const row of rows) {
        if (!row?.id || !row?.math) continue;
        const mathClean = String(row.math).replace(/&/g, ' ').trim();
        items.push({
          id: row.id,
          type: 'Equation',
          contentHTML: katex.renderToString(mathClean, {
            displayMode: true,
            throwOnError: false,
            macros: katexMacros,
          }),
        });
      }
    } else if (node.type === 'heading') {
      const children = node.children ?? [];
      const idx = children.findIndex(
        (c) => c.type === 'mdxTextExpression' && SECTION_COMMENT_RE.test(c.value)
      );
      if (idx === -1) return;
      const m = SECTION_COMMENT_RE.exec(children[idx].value);
      if (!m) return;
      const id = m[1];
      const titleChildren = children.filter((_, i) => i !== idx);
      const last = titleChildren[titleChildren.length - 1];
      if (last?.type === 'text') {
        titleChildren[titleChildren.length - 1] = { ...last, value: last.value.trimEnd() };
      }
      items.push({
        id,
        type: 'Section',
        title: headingToText(titleChildren),
        contentHTML: '',
      });
    } else if (node.type === 'math') {
      const m = (node.meta ?? '').match(LABEL_RE);
      if (m) {
        items.push({
          id: m[1],
          ...(m[2] ? { label: m[2].trim() } : {}),
          type: 'Equation',
          contentHTML: katex.renderToString(node.value.trim(), {
            displayMode: true,
            throwOnError: false,
            macros: katexMacros,
          }),
        });
      } else {
        // Sub-equations: labels embedded in body lines of a multi-line block
        const bodyMatches = [...node.value.matchAll(/\{#([\w:.-]+)(?:\|([^}]*))?\}/g)];
        const bodyIds = bodyMatches.map(m => m[1]);
        const bodyLabels = Object.fromEntries(
          bodyMatches.filter(m => m[2]).map(m => [m[1], m[2].trim()])
        );
        if (bodyIds.length >= 1) {
          const stripped = node.value.replace(/^\s*\\begin\{[\w*]+\}/, '').replace(/\\end\{[\w*]+\}\s*$/, '');
          const isMultiLine = stripped.includes('\\\\');
          if (bodyIds.length >= 2 || isMultiLine) {
            // Store raw math — contentHTML is rendered per-id in buildRegistry
            items.push({ type: 'SubEquationGroup', ids: bodyIds, bodyLabels, rawMath: node.value });
          }
        }
      }
    }
  });

  return items;
}

function collectProofRefs(tree) {
  const refs = [];
  visit(tree, (node) => {
    if (node.type === 'mdxJsxFlowElement' && node.name === 'Proof') {
      const forId = getAttrString(node.attributes, 'for');
      if (forId) refs.push(forId);
    }
  });
  return refs;
}

// ── Sub-equation tooltip renderer ────────────────────────────────────────────

function buildSubEqContentHTML(rawMath, idNumbers, katexMacros) {
  const wrapped = rawMath.match(/^\s*\\begin\{([\w*]+)\}([\s\S]*?)\\end\{\1\}\s*$/);
  const inner = wrapped ? wrapped[2] : rawMath;
  const segments = inner.split('\\\\');

  const idMap = new Map(idNumbers.map(({ id, number }) => [id, number]));

  const rowsHTML = segments.map(seg => {
    const m = seg.match(/\{#([\w:.-]+)(?:\|([^}]*))?\}/);
    const clean = seg.replace(/\{#[\w:.-]+(?:\|[^}]*)?\}/g, '');
    const ampIdx = clean.indexOf('&');
    const left  = (ampIdx >= 0 ? clean.slice(0, ampIdx) : clean).trim();
    const right = (ampIdx >= 0 ? clean.slice(ampIdx + 1) : '').trim();
    const number = m ? (m[2]?.trim() || idMap.get(m[1])) : undefined;

    const lhs = left  ? katex.renderToString(`\\displaystyle{${left}}`,  { displayMode: false, throwOnError: false, macros: katexMacros }) : '';
    const rhs = right ? katex.renderToString(`\\displaystyle{${right}}`, { displayMode: false, throwOnError: false, macros: katexMacros }) : '';
    const num = `<span class="eq-number">${number ? `(${number})` : ''}</span>`;

    return `<span class="subeq-row"><span class="subeq-lhs">${lhs}</span><span class="subeq-rhs">${rhs}</span>${num}</span>`;
  }).join('');

  return `<span class="subeq-table">${rowsHTML}</span>`;
}

// ── Registry builder ─────────────────────────────────────────────────────────

const processor = unified().use(remarkParse).use(remarkMdx).use(remarkMath).use(remarkGfm);

function buildRegistry(root, katexMacros = {}) {
  const chaptersDir = join(root, 'src/content/chapters');
  let files;
  try {
    files = findMdxFiles(chaptersDir);
  } catch {
    console.warn('[registry] src/content/chapters not found — skipping');
    return;
  }

  const fileData = [];
  for (const file of files) {
    const raw = readFileSync(file, 'utf-8');
    const frontmatter = parseFrontmatter(raw);
    const slug = relative(chaptersDir, file).replace(/\.mdx$/, '');
    // Strip frontmatter before parsing (avoids remark treating --- as thematic break)
    const body = raw.replace(/^---[\s\S]*?---\r?\n/, '');
    let tree;
    try {
      tree = processor.parse(body);
    } catch (e) {
      console.warn(`[registry] parse error in ${file}: ${e.message}`);
      continue;
    }
    fileData.push({ frontmatter, slug, items: collectItems(tree, katexMacros), proofRefs: collectProofRefs(tree) });
  }

  // Sort: numeric chapters first (ascending), then string chapters (alphabetical), then null last
  fileData.sort((a, b) => {
    const ca = a.frontmatter.chapter;
    const cb = b.frontmatter.chapter;
    if (ca == null && cb == null) return 0;
    if (ca == null) return 1;
    if (cb == null) return -1;
    if (typeof ca === 'number' && typeof cb === 'number') return ca - cb;
    if (typeof ca === 'number') return -1;
    if (typeof cb === 'number') return 1;
    return String(ca).localeCompare(String(cb));
  });

  // Assign chapter.localCount — a single shared counter per chapter
  const registry = {};
  const seenIds = new Map();    // id → slug of first occurrence
  const seenLabels = new Map(); // label → id of first occurrence
  const checkDupeLabel = (label, id, slug) => {
    if (seenLabels.has(label)) {
      throw new Error(`[registry] duplicate label "${label}" on "${id}" in ${slug} (first used by "${seenLabels.get(label)}")`);
    }
    seenLabels.set(label, id);
  };
  for (const { frontmatter, slug, items } of fileData) {
    const ch = frontmatter.chapter ?? 0;
    let count = 0;
    let sectionCount = 0;
    const checkDupe = (id) => {
      if (seenIds.has(id)) {
        throw new Error(`[registry] duplicate id "${id}" in ${slug} (first seen in ${seenIds.get(id)})`);
      } else {
        seenIds.set(id, slug);
      }
    };
    for (const item of items) {
      if (item.type === 'Section') {
        sectionCount++;
        checkDupe(item.id);
        registry[item.id] = {
          id: item.id,
          type: 'Section',
          number: `${ch}.${sectionCount}`,
          ...(item.title ? { title: item.title } : {}),
          chapter: ch,
          contentHTML: '',
          href: `/chapters/${slug}#${item.id}`,
        };
        continue;
      }
      count++;
      if (item.type === 'SubEquationGroup') {
        const useLetters = item.ids.length > 1;
        const idNumbers = item.ids.map((id, i) => {
          const suffix = useLetters ? String.fromCharCode(97 + i) : '';
          return { id, number: `${ch}.${count}${suffix}` };
        });
        const contentHTML = buildSubEqContentHTML(item.rawMath, idNumbers, katexMacros);
        idNumbers.forEach(({ id, number }) => {
          checkDupe(id);
          const label = item.bodyLabels?.[id];
          if (label) checkDupeLabel(label, id, slug);
          registry[id] = {
            id,
            type: 'Equation',
            number,
            ...(label ? { label } : {}),
            chapter: ch,
            contentHTML,
            href: `/chapters/${slug}#${id}`,
          };
        });
      } else {
        checkDupe(item.id);
        if (item.label) checkDupeLabel(item.label, item.id, slug);
        registry[item.id] = {
          id: item.id,
          type: item.type,
          number: `${ch}.${count}`,
          ...(item.label ? { label: item.label } : {}),
          ...(item.title ? { title: item.title } : {}),
          chapter: ch,
          contentHTML: item.contentHTML,
          href: `/chapters/${slug}#${item.id}`,
        };
      }
    }
  }

  // Inject proofHref onto entries that have a delayed proof
  for (const { slug, proofRefs } of fileData) {
    for (const forId of proofRefs) {
      if (registry[forId]) {
        registry[forId].proofHref = `/chapters/${slug}#proof-of-${forId}`;
      }
    }
  }

  // Back-fill Ref placeholders now that all numbers are known
  for (const entry of Object.values(registry)) {
    entry.contentHTML = entry.contentHTML.replace(/\x00REF:([^\x00]+)\x00/g, (_, refId) => {
      const ref = registry[refId];
      if (!ref) return `<span style="color:red">[?:${esc(refId)}]</span>`;
      const label = ref.type === 'Equation' ? `(${ref.number})` : `${ref.type} ${ref.number}`;
      return esc(label);
    });
  }

  const libDir = join(root, 'src/lib');
  mkdirSync(libDir, { recursive: true });
  writeFileSync(join(libDir, 'registry.json'), JSON.stringify(registry, null, 2));
  console.log(`[registry] ${Object.keys(registry).length} entries → src/lib/registry.json`);
}

// ── Astro integration ────────────────────────────────────────────────────────

/**
 * @param {{ katexMacros?: Record<string,string> }} [options]
 */
export function registryIntegration(options = {}) {
  const { katexMacros = {} } = options;
  let projectRoot;
  return {
    name: 'astro-registry',
    hooks: {
      'astro:config:done': ({ config }) => {
        projectRoot = config.root instanceof URL
          ? fileURLToPath(config.root)
          : String(config.root);
      },
      'astro:config:setup': ({ addWatchFile, updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [{
              name: 'astro-registry-build',
              buildStart() {
                if (!projectRoot) return;
                const chaptersDir = join(projectRoot, 'src/content/chapters');
                try {
                  for (const file of findMdxFiles(chaptersDir)) {
                    this.addWatchFile(file);
                  }
                } catch {}
                buildRegistry(projectRoot, katexMacros);
              },
              watchChange(id) {
                if (projectRoot && id.endsWith('.mdx') && id.includes('/chapters/')) {
                  buildRegistry(projectRoot, katexMacros);
                }
              },
            }],
          },
        });
      },
    },
  };
}
