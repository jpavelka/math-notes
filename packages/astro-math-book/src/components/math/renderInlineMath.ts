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
 * Like renderInlineMath, but also expands [ref:id] tokens into a full
 * .ref/.ref-tooltip structure identical to what <Ref> renders, so hover
 * tooltips work automatically via the existing CSS.
 *
 * Syntax supported inside annotation strings:
 *
 *   [ref:some:id]          — link with auto-generated label (same as <Ref id="some:id"/>)
 *   [ref:some:id|alt text] — link with a custom label     (same as <Ref id="some:id" altLabel="alt text"/>)
 *   $...$                  — inline KaTeX math
 *
 * Use this wherever JSX components cannot be embedded in a string,
 * e.g. AnnotatedAlign annotation strings (MDX files cannot pass JSX as
 * annotation values because Astro's JSX runtime is incompatible with React
 * children).
 */
export function renderAnnotationText(text: string): string {
  return text
    .replace(/\$([^$]+)\$/g, (_, math) =>
      katex.renderToString(math, { throwOnError: false, output: 'html', macros: katexMacros })
    )
    .replace(/\[ref:([\w:.-]+)(?:\|([^\]]*))?\]/g, (_, id, altLabel?: string) => {
      const entry = registry[id];
      if (!entry) return `<span class="ref--unknown">[?:${id}]</span>`;

      const isEquation = entry.kind === 'equation' || (entry.kind == null && entry.type === 'Equation');
      const isSection  = entry.kind === 'section'  || (entry.kind == null && entry.type === 'Section');
      const isChapter  = entry.kind === 'chapter';
      const isAlgoLine = entry.kind === 'algoline';
      const isFloat    = entry.kind === 'float'    || (entry.kind == null && ['Figure', 'Table', 'Video'].includes(entry.type));
      const isEnvStyled = !isEquation && !isSection && !isChapter && !isFloat && !isAlgoLine;

      let linkLabel: string;
      if (isEquation) {
        linkLabel = `(${entry.label ?? entry.number})`;
      } else if (isSection) {
        linkLabel = `§${entry.number}`;
      } else if (isChapter) {
        linkLabel = entry.label ?? (typeof entry.number === 'string' ? `Appendix ${entry.number}` : `Chapter ${entry.number}`);
      } else if (isAlgoLine) {
        const algoRef = (entry as any).algoLabel ?? `Algorithm ${(entry as any).algoNumber}`;
        linkLabel = entry.label ?? `${algoRef}, line ${entry.number}`;
      } else {
        linkLabel = entry.label ?? (entry.type === 'Definition' && entry.title
          ? entry.title
          : `${entry.type} ${entry.number}`);
      }

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
            `--ref-tooltip-bg:var(--env-${envType}-bg)`;
        }
      }

      const styleAttr = tooltipStyle ? ` style="${tooltipStyle}"` : '';
      const displayLabel = altLabel?.trim() || linkLabel;
      return (
        `<span class="ref">` +
        `<a href="${entry.href}" class="ref-link">${displayLabel}</a>` +
        `<span class="${tooltipCls}"${styleAttr}>${tooltipInner}</span>` +
        `</span>`
      );
    });
}
