import type { ReactNode } from 'react';
import { renderInlineMath } from './renderInlineMath';

interface Props {
  id?: string;
  caption?: string;
  number?: string;
  children: ReactNode;
}

export function Table({ id, caption, number, children }: Props) {
  return (
    <figure className="math-table" id={id}>
      <figcaption className="math-table-caption">
        <strong>Table {number}</strong>
        {caption && (
          <>. <span dangerouslySetInnerHTML={{ __html: renderInlineMath(caption) }} /></>
        )}
      </figcaption>
      <div className="math-table-content">{children}</div>
    </figure>
  );
}
