import React, { isValidElement, type ReactNode } from 'react';
import { renderInlineMath } from './renderInlineMath';

function processLatexInNode(node: ReactNode): ReactNode {
  if (node == null || typeof node === 'boolean') return node;
  if (typeof node === 'number') return node;
  if (typeof node === 'string') {
    return node.includes('$')
      ? <span dangerouslySetInnerHTML={{ __html: renderInlineMath(node) }} />
      : node;
  }
  if (Array.isArray(node)) {
    return (node as ReactNode[]).map((child, i) => {
      const processed = processLatexInNode(child);
      return isValidElement(processed) ? React.cloneElement(processed as React.ReactElement, { key: i }) : processed;
    });
  }
  if (isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: ReactNode }>;
    const { children } = element.props;
    if (children == null) return node;
    return React.cloneElement(element, {}, processLatexInNode(children));
  }
  return node;
}

// Astro serializes JSX prop values as { 'astro:jsx': true, type, props } descriptors
// instead of React elements. Convert them back before rendering.
// Astro uses its own fragment symbol (Symbol('astro:fragment')); map any symbol type to React.Fragment.
export function fromAstroJSX(node: unknown): ReactNode {
  if (node == null) return null;
  if (typeof node !== 'object') return node as ReactNode;
  if (Array.isArray(node)) return (node as unknown[]).map((item, i) => {
    const r = fromAstroJSX(item);
    return isValidElement(r) ? React.cloneElement(r as React.ReactElement, { key: i }) : r;
  }) as ReactNode;
  if (isValidElement(node)) return node;
  const n = node as Record<string, unknown>;
  if (!('astro:jsx' in n)) return null;
  const { type, props } = n as { type: unknown; props?: Record<string, unknown> };
  const resolvedType = typeof type === 'symbol' ? React.Fragment : (type as any);
  const { children, ...rest } = (props ?? {}) as { children?: unknown; [k: string]: unknown };
  const kids = children != null ? fromAstroJSX(children) : undefined;
  const elementProps = resolvedType === React.Fragment ? null : (rest as any) || null;
  return kids != null
    ? React.createElement(resolvedType, elementProps, kids)
    : React.createElement(resolvedType, elementProps);
}

export interface FloatEnvProps {
  id?: string;
  /** Plain string caption (supports inline KaTeX math). */
  caption?: string;
  /**
   * JSX caption — use when the caption contains <Ref> or other React components.
   * Example: captionNode={<>See <Ref id="fig:foo"/> for details.</>}
   */
  captionNode?: ReactNode;
  label?: string;
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

  function FloatEnv({ id, caption, captionNode, number, invertInDark, children }: FloatEnvProps) {
    const resolvedCaption: ReactNode = captionNode
      ? processLatexInNode(fromAstroJSX(captionNode))
      : caption
        ? <span dangerouslySetInnerHTML={{ __html: renderInlineMath(caption) }} />
        : null;

    const figcaption = (
      <figcaption className={`${cssPrefix}-caption`}>
        <strong>{type} {number}</strong>
        {resolvedCaption && <>. {resolvedCaption}</>}
      </figcaption>
    );
    const content = (
      <div className={`math-float-content ${cssPrefix}-content${invertInDark ? ' invert-in-dark' : ''}`}>
        {children}
      </div>
    );
    return (
      <figure
        className={cssPrefix}
        id={id}
        {...(id ? { 'data-pagefind-filter': `type:${type}` } : {})}
      >
        {captionPosition === 'top'
          ? <>{figcaption}{content}</>
          : <>{content}{figcaption}</>}
      </figure>
    );
  }

  FloatEnv.displayName = type;
  return FloatEnv;
}
