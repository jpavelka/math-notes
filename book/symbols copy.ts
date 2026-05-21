import type { SymbolEntry } from 'astro-math-book/components';

export const symbols: SymbolEntry[] = [
  // ── Sets & Numbers ────────────────────────────────────────────────────────
  { latex: '\\mathbb{R}',          description: 'set of real numbers',                                    category: 'Sets & Numbers', aliases: ['R'] },
  { latex: '\\mathbb{N}',          description: 'set of natural numbers $\\{1, 2, 3, \\ldots\\}$',        category: 'Sets & Numbers', aliases: ['N'] },
  { latex: '\\mathbb{Z}',          description: 'set of integers',                                         category: 'Sets & Numbers', aliases: ['Z'] },
  { latex: 'x \\in S',             description: '$x$ is an element of set $S$',                            category: 'Sets & Numbers' },
  { latex: 'S \\subset T',         description: '$S$ is a subset of $T$',                                  category: 'Sets & Numbers' },
  { latex: '[a, b]',               description: 'closed interval from $a$ to $b$',                         category: 'Sets & Numbers' },
  { latex: '(a, b)',               description: 'open interval from $a$ to $b$',                           category: 'Sets & Numbers' },

  // ── Quantifiers & Logic ───────────────────────────────────────────────────
  { latex: '\\forall',             description: 'for all',                                                 category: 'Quantifiers & Logic' },
  { latex: '\\exists',             description: 'there exists',                                            category: 'Quantifiers & Logic' },
  { latex: 'P \\implies Q',        description: '$P$ implies $Q$',                                        category: 'Quantifiers & Logic' },
  { latex: 'P \\iff Q',            description: '$P$ if and only if $Q$',                                 category: 'Quantifiers & Logic' },

  // ── Functions ─────────────────────────────────────────────────────────────
  { latex: 'f : D \\to \\mathbb{R}', description: 'function $f$ with domain $D$ and codomain $\\mathbb{R}$', category: 'Functions' },
  { latex: '|x|',                  description: 'absolute value of $x$',                                  category: 'Functions' },
  { latex: '\\sin, \\cos',         description: 'sine and cosine functions',                               category: 'Functions' },
  { latex: '\\ln x',               description: 'natural logarithm of $x$',                               category: 'Functions' },

  // ── Limits & Continuity ───────────────────────────────────────────────────
  { latex: '\\lim_{x \\to x_0} f(x)', description: 'limit of $f(x)$ as $x$ approaches $x_0$',           category: 'Limits & Continuity' },
  { latex: '\\varepsilon',         description: 'tolerance in $\\varepsilon$-$\\delta$ arguments',         category: 'Limits & Continuity' },
  { latex: '\\delta',              description: 'radius in $\\varepsilon$-$\\delta$ arguments',            category: 'Limits & Continuity' },
  { latex: 'f\'(x)',               description: 'derivative of $f$ at $x$',                               category: 'Limits & Continuity' },

  // ── Sequences & Series ────────────────────────────────────────────────────
  { latex: '(a_n)_{n=1}^{\\infty}', description: 'sequence with terms $a_n$',                            category: 'Sequences & Series' },
  { latex: '\\sum_{n=1}^{\\infty} a_n', description: 'infinite series with terms $a_n$',                 category: 'Sequences & Series' },
  { latex: 'a_n \\to L',          description: 'sequence $(a_n)$ converges to limit $L$',                 category: 'Sequences & Series' },
  { latex: '\\limsup_{n} a_n',    description: 'limit superior of $(a_n)$',                               category: 'Sequences & Series' },

  // ── Order & Bounds ────────────────────────────────────────────────────────
  { latex: '\\sup S',              description: 'supremum (least upper bound) of $S$',                    category: 'Order & Bounds' },
  { latex: '\\inf S',              description: 'infimum (greatest lower bound) of $S$',                  category: 'Order & Bounds' },
  { latex: '\\max(a, b)',          description: 'maximum of $a$ and $b$',                                 category: 'Order & Bounds' },
  { latex: '\\min(a, b)',          description: 'minimum of $a$ and $b$',                                 category: 'Order & Bounds' },
  { latex: '\\infty',              description: 'infinity',                                                category: 'Order & Bounds' },
];
