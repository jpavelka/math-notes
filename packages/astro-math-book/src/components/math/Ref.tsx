
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

  const isEquation = entry.type === 'Equation';
  const isSection = entry.type === 'Section';
  const isEnvStyled = !['Equation', 'Figure', 'Table', 'Section', 'Video'].includes(entry.type);

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
    const isCaption = entry.type === 'Table' || entry.type === 'Figure' || entry.type === 'Video';
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
