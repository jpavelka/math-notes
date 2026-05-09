import katex from 'katex';
import { katexMacros } from 'virtual:astro-math-book/katex-macros';
import registry from 'virtual:astro-math-book/registry';

/** Renders a string that may contain $...$ inline math via KaTeX. */
export function renderInlineMath(text: string): string {
  return text.replace(/\$([^$]+)\$/g, (_, math) =>
    katex.renderToString(math, { throwOnError: false, output: 'html', macros: katexMacros })
  );
}

/**
 * Like renderInlineMath, but also expands [ref:id] into a full .ref/.ref-tooltip
 * structure identical to what <Ref> renders, so hover tooltips work automatically
 * via the existing CSS.
 *
 * Use this in contexts where JSX components cannot be embedded in a string,
 * e.g. AnnotatedAlign reason strings.
 */
export function renderReasonText(text: string): string {
  return text
    .replace(/\$([^$]+)\$/g, (_, math) =>
      katex.renderToString(math, { throwOnError: false, output: 'html', macros: katexMacros })
    )
    .replace(/\[ref:([\w:.-]+)\]/g, (_, id) => {
      const entry = registry[id];
      if (!entry) return `<span class="ref--unknown">[?:${id}]</span>`;

      const isEquation = entry.type === 'Equation';
      const isSection = entry.type === 'Section';
      const isEnvStyled = !['Equation', 'Figure', 'Table', 'Section'].includes(entry.type);
      const num = entry.label ?? entry.number;
      const linkLabel = isEquation ? `equation (${num})` : isSection ? `§${num}` : `${entry.type} ${num}`;

      // Same <p>→<span> substitution that Ref.tsx applies (block elements are
      // invalid inside the <span> tooltip).
      const bodyHTML = entry.contentHTML
        .replace(/<p>/g, '<span style="display:block;margin:0.25em 0">')
        .replace(/<\/p>/g, '</span>');

      let tooltipInner: string;
      let tooltipCls = 'ref-tooltip';
      let tooltipStyle = '';

      if (isEquation) {
        tooltipInner = bodyHTML;
      } else if (isSection) {
        const titleHTML = entry.title ? `: <em>${renderInlineMath(entry.title)}</em>` : '';
        tooltipInner = `<strong>Section ${entry.number}</strong>${titleHTML}`;
      } else {
        const titleHTML = entry.title
          ? ` <em>(${renderInlineMath(entry.title)})</em>`
          : '';
        tooltipInner =
          `<span style="display:block;margin-bottom:0.4em">` +
          `<strong>${entry.type} ${entry.number}</strong>${titleHTML}.</span>` +
          bodyHTML;
        if (isEnvStyled) {
          const envType = entry.type.toLowerCase();
          tooltipCls += ' ref-tooltip--env';
          tooltipStyle =
            `border-left-color:var(--env-${envType}-border);` +
            `background:var(--env-${envType}-bg);` +
            `--ref-tooltip-bg:var(--env-${envType}-bg)`;
        }
      }

      const styleAttr = tooltipStyle ? ` style="${tooltipStyle}"` : '';
      return (
        `<span class="ref">` +
        `<a href="${entry.href}" class="ref-link">${linkLabel}</a>` +
        `<span class="${tooltipCls}"${styleAttr}>${tooltipInner}</span>` +
        `</span>`
      );
    });
}
