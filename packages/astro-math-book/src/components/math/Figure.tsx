import type { ReactNode } from 'react';
import { renderInlineMath } from './renderInlineMath';

interface Props {
  id?: string;
  caption?: string;
  number?: string;
  invertInDark?: boolean;
  children: ReactNode;
}

export function Figure({ id, caption, number, invertInDark, children }: Props) {
  return (
    <figure className="math-figure" id={id}>
      <div className={`math-figure-content${invertInDark ? ' invert-in-dark' : ''}`}>{children}</div>
      <figcaption className="math-figure-caption">
        <strong>Figure {number}</strong>
        {caption && (
          <>. <span dangerouslySetInnerHTML={{ __html: renderInlineMath(caption) }} /></>
        )}
      </figcaption>
    </figure>
  );
}
