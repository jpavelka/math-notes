import type { ReactNode } from 'react';
import { renderInlineMath } from './renderInlineMath';

export interface FloatEnvProps {
  id?: string;
  caption?: string;
  number?: string;
  invertInDark?: boolean;
  children: ReactNode;
}

interface FloatEnvOptions {
  /** CSS class prefix. Generates `{prefix}`, `{prefix}-caption`, `{prefix}-content`. Defaults to `math-{type.toLowerCase()}`. */
  cssPrefix?: string;
  /** Whether the caption appears above or below the content. Defaults to 'bottom'. */
  captionPosition?: 'top' | 'bottom';
}

/**
 * Returns a React component for a numbered float environment (Figure/Table/Algorithm-like).
 * Register it in `mathBook({ environments: [{ name: '...', kind: 'float' }] })` to wire
 * up automatic numbering and <Ref> support.
 *
 * @param type  Display name used in the caption label, e.g. "Algorithm" → "Algorithm 2.3"
 * @param options  See FloatEnvOptions
 */
export function createFloatEnv(type: string, options: FloatEnvOptions = {}): React.FC<FloatEnvProps> {
  const { captionPosition = 'bottom' } = options;
  const cssPrefix = options.cssPrefix ?? `math-${type.toLowerCase()}`;

  function FloatEnv({ id, caption, number, invertInDark, children }: FloatEnvProps) {
    const figcaption = (
      <figcaption className={`${cssPrefix}-caption`}>
        <strong>{type} {number}</strong>
        {caption && <>. <span dangerouslySetInnerHTML={{ __html: renderInlineMath(caption) }} /></>}
      </figcaption>
    );
    const content = (
      <div className={`math-float-content ${cssPrefix}-content${invertInDark ? ' invert-in-dark' : ''}`}>
        {children}
      </div>
    );
    return (
      <figure className={cssPrefix} id={id}>
        {captionPosition === 'top'
          ? <>{figcaption}{content}</>
          : <>{content}{figcaption}</>}
      </figure>
    );
  }

  FloatEnv.displayName = type;
  return FloatEnv;
}
