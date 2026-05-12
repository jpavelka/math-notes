
import registryJson from 'virtual:astro-math-book/registry';
import { renderInlineMath } from './renderInlineMath';

const registry = registryJson;

interface Props {
  id: string;
}

export function Ref({ id }: Props) {
  const entry = registry[id];
  if (!entry) {
    return <span className="ref ref--unknown" title={`Unknown reference: ${id}`}>[?:{id}]</span>;
  }

  // entry.kind is present in registries built after the kind field was added.
  // Fall back to type-name checks for older registry.json files.
  const isEquation = entry.kind === 'equation' || (entry.kind == null && entry.type === 'Equation');
  const isSection  = entry.kind === 'section'  || (entry.kind == null && entry.type === 'Section');
  const isFloat    = entry.kind === 'float'    || (entry.kind == null && ['Figure', 'Table', 'Video'].includes(entry.type));
  const isEnvStyled = !isEquation && !isSection && !isFloat;

  let label: string;
  if (isEquation) {
    label = `(${entry.label ?? entry.number})`;
  } else if (isSection) {
    label = `§${entry.number}`;
  } else {
    label = `${entry.type} ${entry.number}`;
  }

  const bodyHTML = entry.contentHTML
    .replace(/<p>/g, '<span style="display:block;margin:0.25em 0">')
    .replace(/<\/p>/g, '</span>');

  let tooltipHTML: string;
  let tooltipClass = 'ref-tooltip';
  let tooltipStyle: Record<string, string> | undefined;

  if (isEquation) {
    tooltipHTML = bodyHTML;
  } else if (isSection) {
    const titleHTML = entry.title ? `: <em>${renderInlineMath(entry.title)}</em>` : '';
    tooltipHTML = `<strong>Section ${entry.number}</strong>${titleHTML}`;
  } else {
    const isCaption = isFloat;
    const titleHTML = entry.title
      ? isCaption
        ? `. <em>${renderInlineMath(entry.title)}</em>`
        : ` <em>(${renderInlineMath(entry.title)})</em>`
      : '';
    const labelHTML = `<span style="display:block;margin-bottom:0.4em"><strong>${entry.type} ${entry.number}</strong>${titleHTML}</span>`;
    tooltipHTML = labelHTML + bodyHTML;
    if (isEnvStyled) {
      const envType = entry.type.toLowerCase();
      tooltipClass += ' ref-tooltip--env';
      tooltipStyle = {
        borderLeftColor: `var(--env-${envType}-border)`,
        background: `var(--env-${envType}-bg)`,
        '--ref-tooltip-bg': `var(--env-${envType}-bg)`,
      };
    }
  }

  return (
    <span className="ref" {...(entry.type === 'Figure' ? { 'data-figure-id': entry.id } : {})}>
      <a href={entry.href} className="ref-link">{label}</a>
      <span
        className={tooltipClass}
        style={tooltipStyle as React.CSSProperties}
        dangerouslySetInnerHTML={{ __html: tooltipHTML }}
      />
    </span>
  );
}
