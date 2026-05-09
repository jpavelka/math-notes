import katex from 'katex';
import { katexMacros } from 'virtual:astro-math-book/katex-macros';

interface Props {
  id?: string;
  number?: string | number;
  label?: string;
  math: string;
}

export function Equation({ id, number, label, math }: Props) {
  const html = katex.renderToString(math, { displayMode: true, throwOnError: false, macros: katexMacros });
  const tag = label ?? (number != null ? String(number) : null);
  return (
    <div className="equation-block" id={id}>
      <span className="eq-content" dangerouslySetInnerHTML={{ __html: html }} />
      {tag != null && <span className="eq-number">({tag})</span>}
    </div>
  );
}
