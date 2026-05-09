import katex from 'katex';
import { katexMacros } from 'virtual:astro-math-book/katex-macros';

interface RowInfo {
  id?: string;
  number?: string;
  label?: string;
  left: string;
  right: string;
}

interface Props {
  rows?: RowInfo[];
}

function renderInline(math: string): string {
  if (!math) return '';
  return katex.renderToString(`\\displaystyle{${math}}`, {
    displayMode: false,
    throwOnError: false,
    macros: katexMacros,
  });
}

export function SubEquations({ rows = [] }: Props) {
  return (
    <div className="subeq-block">
      <div className="subeq-table">
        {rows.map((row, i) => (
          <div key={row.id ?? i} className="subeq-row">
            {/* lhs cell — anchor lives here to avoid creating a phantom table-cell */}
            <span className="subeq-lhs">
              {row.id && <span id={row.id} className="subeq-anchor" />}
              <span dangerouslySetInnerHTML={{ __html: renderInline(row.left) }} />
            </span>
            {/* rhs cell always present so every row has the same column count */}
            <span
              className="subeq-rhs"
              dangerouslySetInnerHTML={{ __html: renderInline(row.right) }}
            />
            <span className="eq-number">
              {(row.label ?? row.number) ? `(${row.label ?? row.number})` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
