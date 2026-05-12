import { visit, SKIP } from 'unist-util-visit';

/**
 * Wraps every <pre> block in a <div class="code-block"> and appends a
 * <button class="copy-code-btn"> so the layout layer can position a copy button.
 * The click handler lives in BookLayout.astro.
 */
export function rehypeCodeCopy() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index == null) return;

      const wrapper = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['code-block'] },
        children: [
          node,
          {
            type: 'element',
            tagName: 'button',
            properties: {
              className: ['copy-code-btn'],
              ariaLabel: 'Copy code',
              type: 'button',
            },
            children: [{ type: 'text', value: 'Copy' }],
          },
        ],
      };

      parent.children[index] = wrapper;
      return SKIP;
    });
  };
}
