import { visit } from 'unist-util-visit';

const SECTION_COMMENT_RE = /^\s*\/\*\s*#?([\w:.-]+)\s*\*\/\s*$/;

/**
 * Detects JSX comment expressions of the form {/* id *\/} inside headings,
 * strips them, and sets data.hProperties.id so rehype-slug uses the custom
 * id as the anchor.
 *
 * Must run before remarkHeadingTexts so TOC entries are captured label-free.
 */
export function remarkSectionRefs() {
  return (tree) => {
    visit(tree, 'heading', (node) => {
      const children = node.children ?? [];
      const idx = children.findIndex(
        (c) => c.type === 'mdxTextExpression' && SECTION_COMMENT_RE.test(c.value)
      );
      if (idx === -1) return;
      const m = SECTION_COMMENT_RE.exec(children[idx].value);
      if (!m) return;
      const id = m[1];
      node.children.splice(idx, 1);
      const prev = node.children[idx - 1];
      if (prev?.type === 'text') prev.value = prev.value.trimEnd();
      node.data ??= {};
      node.data.hProperties ??= {};
      node.data.hProperties.id = id;
      node.data.id = id;
    });
  };
}
