import type { ReactNode } from 'react';

import registryJson from 'virtual:astro-math-book/registry';

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
      label = (
        <em>
          Proof of <a href={entry.href}>{entry.type} {entry.number}</a>.
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
