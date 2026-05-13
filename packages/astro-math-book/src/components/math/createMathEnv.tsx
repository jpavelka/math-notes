import type { ReactNode } from 'react';
import registryJson from 'virtual:astro-math-book/registry';
import { renderInlineMath } from './renderInlineMath';

const registry = registryJson;

export interface MathEnvProps {
  id?: string;
  title?: string;
  alt?: string;
  label?: string;
  number?: number;
  children: ReactNode;
}

/**
 * Returns a React component for a styled, numbered math environment.
 * The component receives `number` automatically from the remark plugin when
 * the environment is registered via `mathBook({ environments: [...] })`.
 *
 * @param type  Display name used in the label, e.g. "Example" → "Example 2.3"
 * @param cssKey  CSS modifier suffix (defaults to type.toLowerCase())
 */
export function createMathEnv(type: string, cssKey?: string): React.FC<MathEnvProps> {
  const key = cssKey ?? type.toLowerCase();

  function MathEnv({ id, title, number, children }: MathEnvProps) {
    const proofHref = id ? registry[id]?.proofHref : undefined;
    return (
      <div
        className={`math-env math-env--${key}`}
        id={id}
        {...(id ? { 'data-pagefind-filter': `type:${type}` } : {})}
      >
        <div className="math-env-label">
          <strong>{type} {number}</strong>
          {title && <em> (<span dangerouslySetInnerHTML={{ __html: renderInlineMath(title) }} />)</em>}
          {proofHref && <a href={proofHref} className="math-env-proof-link">proof ↓</a>}
        </div>
        <div className="math-env-body">{children}</div>
      </div>
    );
  }

  MathEnv.displayName = type;
  return MathEnv;
}
