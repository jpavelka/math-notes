import type { ReactNode } from 'react';

import registryJson from 'virtual:astro-math-book/registry';
import { renderInlineMath } from './renderInlineMath';

const registry = registryJson;

interface Props {
  id?: string;
  title?: string;
  number?: number;
  children: ReactNode;
}

export function Remark({ id, title, number, children }: Props) {
  const proofHref = id ? registry[id]?.proofHref : undefined;
  return (
    <div className="math-env math-env--remark" id={id}>
      <div className="math-env-label">
        <strong>Remark {number}</strong>
        {title && <em> (<span dangerouslySetInnerHTML={{ __html: renderInlineMath(title) }} />)</em>}
        {proofHref && <a href={proofHref} className="math-env-proof-link">proof ↓</a>}
      </div>
      <div className="math-env-body">{children}</div>
    </div>
  );
}
