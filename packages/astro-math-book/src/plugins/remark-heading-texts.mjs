import { visit } from 'unist-util-visit';
import { readFileSync } from 'node:fs';

function getAttrString(attrs, name) {
  const a = attrs?.find(a => a.name === name);
  if (!a) return null;
  if (typeof a.value === 'string') return a.value;
  const lit = a.value?.data?.estree?.body?.[0]?.expression;
  if (lit?.type === 'Literal') return String(lit.value);
  return null;
}

function refLabel(entry) {
  if (!entry) return '?';
  if (entry.kind === 'equation') return `(${entry.label ?? entry.number})`;
  if (entry.kind === 'section')  return `§${entry.number}`;
  if (entry.kind === 'chapter')  return entry.label ?? (typeof entry.number === 'string' ? `Appendix ${entry.number}` : `Chapter ${entry.number}`);
  return entry.label ?? `${entry.type} ${entry.number}`;
}

/**
 * Walk a heading node's children and reconstruct the text with $...$ delimiters
 * around inlineMath nodes. Resolves <Ref id="..."/> to its registry label.
 */
function headingToText(node, registry) {
  if (node.type === 'inlineMath') return '$' + node.value + '$';
  if (node.type === 'mdxJsxTextElement' && node.name === 'Ref') {
    const id = getAttrString(node.attributes, 'id');
    return id ? refLabel(registry[id]) : '';
  }
  if (!node.children) return node.value ?? '';
  return node.children.map(c => headingToText(c, registry)).join('');
}

/**
 * Captures heading text in a form where $...$ math is preserved for KaTeX rendering
 * and <Ref> components are replaced with their display labels.
 * Stored in remarkPluginFrontmatter.headingTexts (string[], document order).
 */
export function remarkHeadingTexts({ getRegistryPath } = {}) {
  return function (tree, file) {
    let registry = {};
    if (getRegistryPath) {
      try { registry = JSON.parse(readFileSync(getRegistryPath(), 'utf-8')); }
      catch {}
    }

    const texts = [];
    visit(tree, 'heading', (node) => {
      texts.push(headingToText(node, registry));
    });
    file.data.astro ??= {};
    file.data.astro.frontmatter ??= {};
    file.data.astro.frontmatter.headingTexts = texts;
  };
}
