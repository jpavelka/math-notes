import { visit } from 'unist-util-visit';

/**
 * Walk a heading node's children and reconstruct the text with $...$ delimiters
 * around inlineMath nodes. This works whether remark-math has already run or not.
 */
function headingToText(node) {
  if (!node.children) {
    if (node.type === 'inlineMath') return '$' + node.value + '$';
    return node.value ?? '';
  }
  return node.children.map(headingToText).join('');
}

/**
 * Captures heading text in a form where $...$ math is preserved for KaTeX rendering.
 * Stored in remarkPluginFrontmatter.headingTexts (string[], document order).
 */
export function remarkHeadingTexts() {
  return function (tree, file) {
    const texts = [];
    visit(tree, 'heading', (node) => {
      texts.push(headingToText(node));
    });
    file.data.astro ??= {};
    file.data.astro.frontmatter ??= {};
    file.data.astro.frontmatter.headingTexts = texts;
  };
}
