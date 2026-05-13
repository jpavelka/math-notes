import { renderInlineMath } from './renderInlineMath';

export interface SymbolEntry {
  /** Raw LaTeX, e.g. "\\mathbb{R}" — rendered via KaTeX */
  latex: string;
  /** Description text; may include inline math in $...$ delimiters */
  description: string;
  /** Category heading used to group rows */
  category: string;
  /** Extra search terms, e.g. ['R'] for \\mathbb{R} or ['->'] for \\to */
  aliases?: string[];
}

interface Props {
  symbols: SymbolEntry[];
}

// Keep in sync with makeSymbolIds in astro-registry.mjs
function slugifyOnce(latex: string): string {
  const slug = String(latex ?? '')
    .replace(/\\([A-Za-z]+)/g, '$1')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 40);
  return slug ? `sym-${slug}` : 'sym';
}

function makeSymbolIds(symbols: { latex: string }[]): string[] {
  const used = new Set<string>();
  return symbols.map(({ latex }) => {
    const base = slugifyOnce(latex);
    if (!used.has(base)) { used.add(base); return base; }
    let n = 2;
    while (used.has(`${base}-${n}`)) n++;
    const id = `${base}-${n}`;
    used.add(id);
    return id;
  });
}

export function NotationTable({ symbols }: Props) {
  const ids = makeSymbolIds(symbols);
  const indexed = symbols.map((sym, i) => ({ sym, id: ids[i] }));

  const categories = new Map<string, Array<{ sym: SymbolEntry; id: string }>>();
  for (const item of indexed) {
    if (!categories.has(item.sym.category)) categories.set(item.sym.category, []);
    categories.get(item.sym.category)!.push(item);
  }

  return (
    <div className="notation-table">
      {[...categories.entries()].map(([cat, items]) => (
        <section key={cat}>
          <h2>{cat}</h2>
          <table>
            <thead>
              <tr><th>Symbol</th><th>Meaning</th></tr>
            </thead>
            <tbody>
              {items.map(({ sym: e, id }) => (
                <tr key={id} id={id}>
                  <td dangerouslySetInnerHTML={{ __html: renderInlineMath(`$${e.latex}$`) }} />
                  <td dangerouslySetInnerHTML={{ __html: renderInlineMath(e.description) }} />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
