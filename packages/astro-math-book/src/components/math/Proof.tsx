import type { ReactNode } from 'react';

import registryJson from 'virtual:astro-math-book/registry';
import { renderInlineMath } from './renderInlineMath';

const registry = registryJson;

interface Props {
  for?: string;
  children: ReactNode;
}

export function Proof({ for: forId, children }: Props) {
  let label: ReactNode = <em>Proof.</em>;

  if (forId) {
    const entry = registry[forId];
    if (entry) {
      const envType = entry.type.toLowerCase();
      const bodyHTML = entry.contentHTML
        .replace(/<p>/g, '<span style="display:block;margin:0.25em 0">')
        .replace(/<\/p>/g, '</span>');
      const titleHTML = entry.title
        ? ` <em>(${renderInlineMath(entry.title)})</em>`
        : '';
      const labelHTML = `<span style="display:block;margin-bottom:0.4em"><strong>${entry.type} ${entry.number}</strong>${titleHTML}</span>`;
      const tooltipStyle = {
        borderLeftColor: `var(--env-${envType}-border)`,
        background: `var(--env-${envType}-bg)`,
        '--ref-tooltip-bg': `var(--env-${envType}-bg)`,
      };

      label = (
        <em>
          Proof of{' '}
          <span className="ref">
            <a href={entry.href} className="ref-link">{entry.type} {entry.number}</a>
            <span
              className="ref-tooltip ref-tooltip--env"
              style={tooltipStyle as React.CSSProperties}
              dangerouslySetInnerHTML={{ __html: labelHTML + bodyHTML }}
            />
          </span>.
        </em>
      );
    } else {
      label = <em>Proof of [?:{forId}].</em>;
    }
  }

  return (
    <div className="math-env math-env--proof" id={forId ? `proof-of-${forId}` : undefined}>
      <div className="math-env-label">{label}</div>
      <div className="math-env-body">{children}</div>
    </div>
  );
}
