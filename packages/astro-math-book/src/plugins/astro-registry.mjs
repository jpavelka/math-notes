/**
 * Astro integration: walks all MDX files at build start, assigns
 * globally-consistent chapter.localCount numbers, serialises each
 * labelled item's body to HTML, and writes .astro/registry.json.
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

// ── Structural fingerprinting ────────────────────────────────────────────────
// Used in dev to skip registry rebuilds for prose-only edits.
// A "structural" line is anything that could affect the registry: frontmatter,
// JSX opening tags, environment attributes, equation labels, section ref comments.

const STRUCTURAL_RE = /\bid=|title=|\balt=|label=|caption=|\{#|\{\/\*/;

function registryFingerprint(content) {
  const lines = content.split('\n');
  const out = [];
  let inFrontmatter = false;
  let frontmatterDone = false;
  for (const line of lines) {
    if (!frontmatterDone) {
      out.push(line);
      if (line.trimEnd() === '---') {
        if (!inFrontmatter) inFrontmatter = true;
        else frontmatterDone = true;
      }
      continue;
    }
    if (line.trimStart().startsWith('<') || STRUCTURAL_RE.test(line)) out.push(line);
  }
  return out.join('\n');
}

function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h;
}

// ── Symbol ID generation ─────────────────────────────────────────────────────
// Keep in sync with makeSymbolIds in NotationTable.tsx

function slugifyOnce(latex) {
  const slug = String(latex ?? '')
    .replace(/\\([A-Za-z]+)/g, '$1')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 40);
  return slug ? `sym-${slug}` : 'sym';
}

function makeSymbolIds(symbols) {
  const used = new Set();
  return symbols.map(({ latex }) => {
    const base = slugifyOnce(latex);
    if (!used.has(base)) { used.add(base); return base; }
    let n = 2;
    while (used.has(`${base}-${n}`)) n++;
    const id = `${base}-${n}`;
    used.add(id);
    return id;
  });
}

// ── Constants ────────────────────────────────────────────────────────────────

const NUMBERED_ENVS = new Set(['Theorem', 'Definition', 'Lemma', 'Corollary', 'Remark', 'Figure', 'Table', 'YouTubeEmbed', 'Algorithm', 'Problem']);
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
  const chapterId = yaml.match(/^chapterId:\s*["']?([\w:.-]+)["']?\s*$/m)?.[1] ?? null;
  const label = yaml.match(/^label:\s*["']?(.*?)["']?\s*$/m)?.[1];
  return {
    chapter,
    title: title?.trim() ?? null,
    chapterId,
    label: label?.trim() ?? null,
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

  function renderAttr(src) {
    return (src ?? '').replace(/\$([^$]+)\$/g, (_, math) =>
      katex.renderToString(math, { throwOnError: false, macros: katexMacros })
    );
  }

  // Walk a JSX estree node (from a JSX-valued MDX attribute) to HTML.
  function jsxEstreeToHtml(node) {
    if (!node) return '';
    switch (node.type) {
      case 'JSXFragment':
        return (node.children ?? []).map(jsxEstreeToHtml).join('');
      case 'JSXElement': {
        const name = node.openingElement?.name?.name ?? '';
        if (name === 'Ref') {
          const jsxAttrs = node.openingElement?.attributes ?? [];
          const idAttr = jsxAttrs.find(a => a.name?.name === 'id');
          const refId = idAttr?.value?.type === 'Literal'
            ? String(idAttr.value.value)
            : idAttr?.value?.type === 'JSXExpressionContainer' && idAttr.value.expression?.type === 'Literal'
              ? String(idAttr.value.expression.value)
              : '';
          if (refId) return `\x00REF:${JSON.stringify({ id: refId })}\x00`;
        }
        return (node.children ?? []).map(jsxEstreeToHtml).join('');
      }
      case 'JSXText':
        return renderAttr(node.value);
      case 'JSXExpressionContainer':
        if (node.expression?.type === 'Literal') return renderAttr(String(node.expression.value));
        return '';
      default:
        return '';
    }
  }

  // Render a prop that may be a plain string or a JSX expression to HTML.
  function getAttrHtml(attrs, name) {
    const str = getAttrString(attrs, name);
    if (str != null) return renderAttr(str);
    const a = attrs?.find(a => a.name === name);
    if (!a) return '';
    const expr = a.value?.data?.estree?.body?.[0]?.expression;
    return expr ? jsxEstreeToHtml(expr) : '';
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
          if (refId) {
            const props = { id: refId };
            if (getBoolAttr(node.attributes, 'useTitle')) props.useTitle = true;
            const altLabel = getAttrString(node.attributes, 'altLabel');
            if (altLabel) props.altLabel = altLabel;
            const textTransform = getAttrString(node.attributes, 'textTransform');
            if (textTransform) props.textTransform = textTransform;
            return `\x00REF:${JSON.stringify(props)}\x00`;
          }
        }
        // Problem sub-components
        if (node.name === 'ProblemInstance') return `<p><strong>Instance:</strong> ${nodesToHtml(node.children)}</p>`;
        if (node.name === 'ProblemQuestion') return `<p><strong>Problem:</strong> ${nodesToHtml(node.children)}</p>`;
        if (node.name === 'ProblemVariants') return `<p><strong>Variants:</strong> ${nodesToHtml(node.children)}</p>`;
        if (node.name === 'ProblemInEnglish') return `<p><strong>In English:</strong> ${nodesToHtml(node.children)}</p>`;
        // Algorithm sub-components — emit algo CSS class structure so tooltips get indents + line numbers
        if (node.name === 'AlgoStep')
          return `<span class="algo-line"><span class="algo-num"></span><span class="algo-body">${nodesToHtml(node.children)}</span></span>`;
        if (node.name === 'AlgoReturn')
          return `<span class="algo-line"><span class="algo-num"></span><span class="algo-body"><strong>return</strong> ${nodesToHtml(node.children)}</span></span>`;
        if (node.name === 'AlgoComment')
          return `<span class="algo-line algo-comment"><span class="algo-num" aria-hidden="true"></span><span class="algo-body"><span class="algo-comment-marker" aria-hidden="true">▷</span> ${nodesToHtml(node.children)}</span></span>`;
        if (node.name === 'AlgoInput')
          return `<span class="algo-meta" style="display:block"><span class="algo-meta-label">Input:</span> ${nodesToHtml(node.children)}</span>`;
        if (node.name === 'AlgoOutput')
          return `<span class="algo-meta" style="display:block"><span class="algo-meta-label">Output:</span> ${nodesToHtml(node.children)}</span>`;
        if (node.name === 'AlgoFor') {
          const condHtml = getAttrHtml(node.attributes, 'each');
          return `<span class="algo-line"><span class="algo-num"></span><span class="algo-body"><strong>for</strong> ${condHtml} <strong>do</strong></span></span><span class="algo-block" style="display:block">${nodesToHtml(node.children)}</span>`;
        }
        if (node.name === 'AlgoWhile') {
          const condHtml = getAttrHtml(node.attributes, 'cond');
          return `<span class="algo-line"><span class="algo-num"></span><span class="algo-body"><strong>while</strong> ${condHtml} <strong>do</strong></span></span><span class="algo-block" style="display:block">${nodesToHtml(node.children)}</span>`;
        }
        if (node.name === 'AlgoIf') {
          const condHtml = getAttrHtml(node.attributes, 'cond');
          return `<span class="algo-line"><span class="algo-num"></span><span class="algo-body"><strong>if</strong> ${condHtml} <strong>then</strong></span></span><span class="algo-block" style="display:block">${nodesToHtml(node.children)}</span>`;
        }
        if (node.name === 'AlgoElseIf') {
          const condHtml = getAttrHtml(node.attributes, 'cond');
          return `<span class="algo-line"><span class="algo-num"></span><span class="algo-body"><strong>else if</strong> ${condHtml} <strong>then</strong></span></span><span class="algo-block" style="display:block">${nodesToHtml(node.children)}</span>`;
        }
        if (node.name === 'AlgoElse')
          return `<span class="algo-line"><span class="algo-num"></span><span class="algo-body"><strong>else</strong></span></span><span class="algo-block" style="display:block">${nodesToHtml(node.children)}</span>`;
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

  return { nodesToHtml, nodeToHtml, getAttrHtml };
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

function getBoolAttr(attrs, name) {
  const a = attrs?.find((a) => a.name === name);
  if (!a) return false;
  if (a.value === null) return true; // bare boolean shorthand: useTitle
  if (typeof a.value === 'string') return a.value !== 'false';
  const lit = a.value?.data?.estree?.body?.[0]?.expression;
  if (lit?.type === 'Literal') return Boolean(lit.value);
  return false;
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

const FLOAT_ENVS = new Set(['Figure', 'Table', 'Algorithm']);
const SECTION_COMMENT_RE = /^\s*\/\*\s*#?([\w:.-]+)\s*\*\/\s*$/;
const ALGO_LINE_COMPONENTS = new Set(['AlgoStep', 'AlgoReturn', 'AlgoFor', 'AlgoWhile', 'AlgoIf', 'AlgoElseIf', 'AlgoElse']);

function makeLineHeaderHTML(node, getAttrHtml, nodesToHtml) {
  // No algo-num span: the number is shown in the tooltip header, not inline.
  const wrap = (body) => `<span class="algo-line"><span class="algo-body">${body}</span></span>`;
  switch (node.name) {
    case 'AlgoStep':   return wrap(nodesToHtml(node.children));
    case 'AlgoReturn': return wrap(`<strong>return</strong> ${nodesToHtml(node.children)}`);
    case 'AlgoFor':    return wrap(`<strong>for</strong> ${getAttrHtml(node.attributes, 'each')} <strong>do</strong>`);
    case 'AlgoWhile':  return wrap(`<strong>while</strong> ${getAttrHtml(node.attributes, 'cond')} <strong>do</strong>`);
    case 'AlgoIf':     return wrap(`<strong>if</strong> ${getAttrHtml(node.attributes, 'cond')} <strong>then</strong>`);
    case 'AlgoElseIf': return wrap(`<strong>else if</strong> ${getAttrHtml(node.attributes, 'cond')} <strong>then</strong>`);
    case 'AlgoElse':   return wrap(`<strong>else</strong>`);
    default: return '';
  }
}

// Pre-order depth-first traversal matching the CSS counter order.
// Handles both mdxJsxFlowElement and mdxJsxTextElement (remark-mdx can produce
// either depending on context), and recurses through wrapper nodes (e.g. paragraphs)
// that may appear between JSX siblings when there are no blank lines.
function collectAlgoLines(node, counter, algoId, items, getAttrHtml, nodesToHtml) {
  for (const child of node.children ?? []) {
    const isJsx = child.type === 'mdxJsxFlowElement' || child.type === 'mdxJsxTextElement';
    if (isJsx && ALGO_LINE_COMPONENTS.has(child.name)) {
      const lineNum = ++counter.n;
      const id = getAttrString(child.attributes, 'id');
      if (id) {
        items.push({
          id,
          type: 'AlgoLine',
          kind: 'algoline',
          lineNumber: lineNum,
          algoId,
          contentHTML: makeLineHeaderHTML(child, getAttrHtml, nodesToHtml),
        });
      }
    }
    // Always recurse: algo components may be nested inside wrapper nodes or
    // inside control-flow block bodies.
    if (child.children?.length) {
      collectAlgoLines(child, counter, algoId, items, getAttrHtml, nodesToHtml);
    }
  }
}

function collectItems(tree, katexMacros, environments = []) {
  const { nodesToHtml, getAttrHtml } = makeSerializer(katexMacros);
  const envMap = new Map(environments.map(e => [e.name, e]));
  const allNumbered = new Set([...NUMBERED_ENVS, ...envMap.keys()]);
  const items = [];
  let envIndex = 0;

  visit(tree, (node) => {
    if (node.type === 'mdxJsxFlowElement' && allNumbered.has(node.name)) {
      const thisIdx = envIndex++;
      const id = getAttrString(node.attributes, 'id');
      const labelAttr = getAttrString(node.attributes, 'label') ?? undefined;
      if (node.name === 'YouTubeEmbed') {
        const videoId = getAttrString(node.attributes, 'videoId');
        const caption = getAttrString(node.attributes, 'caption');
        const thumbHTML = videoId
          ? `<img src="https://img.youtube.com/vi/${esc(videoId)}/hqdefault.jpg" alt="${esc(caption ?? 'Video')}" style="max-width:100%;height:auto">`
          : '';
        items.push({ id, autoIdx: thisIdx, type: 'Video', kind: 'float', ...(labelAttr ? { label: labelAttr } : {}), title: caption ?? undefined, contentHTML: thumbHTML });
      } else if (FLOAT_ENVS.has(node.name)) {
        const caption = getAttrString(node.attributes, 'caption');
        items.push({
          id,
          autoIdx: thisIdx,
          type: node.name,
          kind: 'float',
          ...(labelAttr ? { label: labelAttr } : {}),
          title: caption ?? undefined,
          contentHTML: nodesToHtml(node.children),
        });
        if (node.name === 'Algorithm') {
          const lineCounter = { n: 0 };
          collectAlgoLines(node, lineCounter, id, items, getAttrHtml, nodesToHtml);
        }
      } else {
        const desc = envMap.get(node.name);
        if (desc?.kind === 'float') {
          const caption = getAttrString(node.attributes, 'caption');
          items.push({ id, autoIdx: thisIdx, type: desc.type ?? node.name, kind: 'float', ...(labelAttr ? { label: labelAttr } : {}), title: caption ?? undefined, contentHTML: nodesToHtml(node.children) });
        } else if (desc?.collectContent) {
          const result = desc.collectContent(node, { getAttrString, nodesToHtml });
          items.push({ id, autoIdx: thisIdx, type: desc.type ?? node.name, ...(labelAttr ? { label: labelAttr } : {}), ...result });
        } else {
          const altRaw = getAttrString(node.attributes, 'alt');
          const altAttr = altRaw
            ? altRaw.split('|').map(s => s.trim()).filter(Boolean)
            : undefined;
          items.push({
            id,
            autoIdx: thisIdx,
            type: desc?.type ?? node.name,
            ...(labelAttr ? { label: labelAttr } : {}),
            title: getAttrString(node.attributes, 'title') ?? undefined,
            ...(altAttr?.length ? { alt: altAttr } : {}),
            contentHTML: nodesToHtml(node.children),
          });
        }
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
          kind: 'equation',
          ...(row.label ? { label: String(row.label) } : {}),
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
        kind: 'section',
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
          kind: 'equation',
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
            items.push({ type: 'SubEquationGroup', kind: 'equation', ids: bodyIds, bodyLabels, rawMath: node.value });
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

function buildRegistry(root, katexMacros = {}, environments = [], symbols = [], symbolsSlug = 'b-notation', bookSlug = 'chapters', contentDir, chapterBase) {
  const resolvedContentDir = contentDir ?? `src/content/${bookSlug}`;
  const base = chapterBase !== undefined ? chapterBase : `/${bookSlug}`;
  const chaptersDir = join(root, resolvedContentDir);
  let files;
  try {
    files = findMdxFiles(chaptersDir);
  } catch {
    console.warn(`[registry] ${resolvedContentDir} not found — skipping`);
    return;
  }

  const fileData = [];
  for (const file of files) {
    const raw = readFileSync(file, 'utf-8');
    const frontmatter = parseFrontmatter(raw);
    const slug = relative(chaptersDir, file).replace(/\.mdx$/, '').toLowerCase();
    // Strip frontmatter before parsing (avoids remark treating --- as thematic break)
    const body = raw.replace(/^---[\s\S]*?---\r?\n/, '');
    let tree;
    try {
      tree = processor.parse(body);
    } catch (e) {
      console.warn(`[registry] parse error in ${file}: ${e.message}`);
      continue;
    }
    fileData.push({ frontmatter, slug, items: collectItems(tree, katexMacros, environments), proofRefs: collectProofRefs(tree) });
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
    if (frontmatter.chapterId) {
      checkDupe(frontmatter.chapterId);
      registry[frontmatter.chapterId] = {
        id: frontmatter.chapterId,
        type: 'Chapter',
        kind: 'chapter',
        number: ch,
        ...(frontmatter.title ? { title: frontmatter.title } : {}),
        ...(frontmatter.label ? { label: frontmatter.label } : {}),
        chapter: ch,
        contentHTML: '',
        href: `${base}/${slug}`,
      };
    }
    for (const item of items) {
      if (item.type === 'AlgoLine') {
        if (item.id) {
          checkDupe(item.id);
          const algo = item.algoId ? registry[item.algoId] : undefined;
          registry[item.id] = {
            id: item.id,
            type: 'AlgoLine',
            kind: 'algoline',
            number: String(item.lineNumber),
            algoNumber: algo?.number ?? '?',
            ...(algo?.label ? { algoLabel: algo.label } : {}),
            ...(item.algoId ? { algoId: item.algoId } : {}),
            chapter: ch,
            contentHTML: item.contentHTML,
            href: `${base}/${slug}#${item.id}`,
          };
        }
        continue;
      }
      if (item.type === 'Section') {
        sectionCount++;
        checkDupe(item.id);
        registry[item.id] = {
          id: item.id,
          type: 'Section',
          kind: 'section',
          number: `${ch}.${sectionCount}`,
          ...(item.title ? { title: item.title } : {}),
          chapter: ch,
          contentHTML: '',
          href: `${base}/${slug}#${item.id}`,
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
            kind: 'equation',
            number,
            ...(label ? { label } : {}),
            chapter: ch,
            contentHTML,
            href: `${base}/${slug}#${id}`,
          };
        });
      } else {
        const effectiveId = item.id ?? `__auto-${slug}-${item.autoIdx}`;
        checkDupe(effectiveId);
        if (item.label) checkDupeLabel(item.label, effectiveId, slug);
        registry[effectiveId] = {
          id: effectiveId,
          type: item.type,
          ...(item.kind ? { kind: item.kind } : {}),
          number: `${ch}.${count}`,
          ...(item.label ? { label: item.label } : {}),
          ...(item.title ? { title: item.title } : {}),
          ...(item.alt?.length ? { alt: item.alt } : {}),
          chapter: ch,
          contentHTML: item.contentHTML,
          href: `${base}/${slug}#${effectiveId}`,
        };
      }
    }
  }

  // Inject proofHref onto entries that have a delayed proof
  for (const { slug, proofRefs } of fileData) {
    for (const forId of proofRefs) {
      if (registry[forId]) {
        registry[forId].proofHref = `${base}/${slug}#proof-of-${forId}`;
      }
    }
  }

  // Back-fill Ref placeholders now that all numbers are known
  const renderRefLabel = (s) => s.split(/(\$[^$]+\$)/).map((part, i) =>
    i % 2 === 0 ? esc(part) : katex.renderToString(part.slice(1, -1), { throwOnError: false, macros: katexMacros })
  ).join('');
  const applyRefTransform = (s, transform) => {
    const fn = transform === 'lowercase' ? (t) => t.toLowerCase()
      : transform === 'uppercase' ? (t) => t.toUpperCase()
      : (t) => t.replace(/\b\w/g, c => c.toUpperCase());
    return s.split(/(\$[^$]+\$)/).map((part, i) => i % 2 === 0 ? fn(part) : part).join('');
  };
  for (const entry of Object.values(registry)) {
    entry.contentHTML = entry.contentHTML.replace(/\x00REF:([^\x00]+)\x00/g, (_, payload) => {
      let refId, useTitle = false, altLabel = null, textTransform = null;
      try {
        const props = JSON.parse(payload);
        refId = props.id; useTitle = props.useTitle ?? false;
        altLabel = props.altLabel ?? null; textTransform = props.textTransform ?? null;
      } catch { refId = payload; }
      const ref = registry[refId];
      if (!ref) return `<span style="color:red">[?:${esc(refId)}]</span>`;
      let rawLabel;
      if (altLabel) rawLabel = altLabel;
      else if (useTitle && ref.title) rawLabel = ref.title;
      else rawLabel = ref.type === 'Equation' ? `(${ref.label ?? ref.number})` : (ref.label ?? `${ref.type} ${ref.number}`);
      if (textTransform) rawLabel = applyRefTransform(rawLabel, textTransform);
      return renderRefLabel(rawLabel);
    });
  }

  // Inject symbol entries from symbols.ts
  if (symbols.length > 0) {
    const symbolsBase = `${base}/${symbolsSlug}`;
    const ids = makeSymbolIds(symbols);
    symbols.forEach((sym, i) => {
      const id = ids[i];
      if (registry[id]) {
        console.warn(`[registry] symbol id "${id}" conflicts with existing entry — skipping`);
        return;
      }
      registry[id] = {
        id,
        type: 'Symbol',
        kind: 'symbol',
        number: '',
        latex: sym.latex,
        ...(sym.aliases?.length ? { aliases: sym.aliases } : {}),
        title: sym.description,
        chapter: 0,
        contentHTML: katex.renderToString(sym.latex, { throwOnError: false, macros: katexMacros }),
        href: `${symbolsBase}#${id}`,
      };
    });
  }

  const astroDir = join(root, '.astro');
  mkdirSync(astroDir, { recursive: true });
  writeFileSync(join(astroDir, 'registry.json'), JSON.stringify(registry, null, 2));
  console.log(`[registry] ${Object.keys(registry).length} entries → .astro/registry.json`);
}

// ── Astro integration ────────────────────────────────────────────────────────

/**
 * @param {{ katexMacros?: Record<string,string>, environments?: import('../integration.mjs').EnvDescriptor[], symbols?: import('../components/math/NotationTable').SymbolEntry[], symbolsSlug?: string, bookSlug?: string, contentDir?: string }} [options]
 */
export function registryIntegration(options = {}) {
  const { katexMacros = {}, environments = [], symbols = [], symbolsSlug = 'b-notation', bookSlug = 'chapters', contentDir, chapterBase } = options;
  const resolvedContentDir = contentDir ?? `src/content/${bookSlug}`;
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
        const fingerprints = new Map(); // absPath → fnv1a hash of structural content

        updateConfig({
          vite: {
            plugins: [{
              name: 'astro-registry-build',
              buildStart() {
                if (!projectRoot) return;
                const absContentDir = join(projectRoot, resolvedContentDir);
                let allFiles = [];
                try {
                  allFiles = findMdxFiles(absContentDir);
                  for (const file of allFiles) this.addWatchFile(file);
                } catch {}
                buildRegistry(projectRoot, katexMacros, environments, symbols, symbolsSlug, bookSlug, resolvedContentDir, chapterBase);
                // Seed fingerprints so the first watchChange has a baseline to compare
                for (const file of allFiles) {
                  try { fingerprints.set(file, fnv1a(registryFingerprint(readFileSync(file, 'utf-8')))); } catch {}
                }
              },
              watchChange(id) {
                if (!projectRoot || !id.endsWith('.mdx') || !id.startsWith(join(projectRoot, resolvedContentDir))) return;
                let content;
                try { content = readFileSync(id, 'utf-8'); } catch { return; }
                const fp = fnv1a(registryFingerprint(content));
                if (fingerprints.get(id) === fp) {
                  // Prose-only edit — numbers/ids unchanged, skip the expensive rebuild
                  return;
                }
                fingerprints.set(id, fp);
                buildRegistry(projectRoot, katexMacros, environments, symbols, symbolsSlug, bookSlug, resolvedContentDir, chapterBase);
              },
            }],
          },
        });
      },
    },
  };
}
