import type { SymbolEntry } from 'astro-math-book/components';

export const symbols: SymbolEntry[] = [
  // ── Sets & Logic ──────────────────────────────────────────────────────────
  { latex: '\\{\\cdots\\}',          description: 'set notation; $\\{0,1\\}$ is the two-element set containing 0 and 1',                                                      category: 'Sets & Logic' },
  { latex: 'x \\in S',              description: '$x$ is an element of set $S$; e.g. $\\pi \\in \\R$',                                                                       category: 'Sets & Logic', aliases: ['in', 'element'] },
  { latex: 'x \\not\\in S',         description: '$x$ is not an element of set $S$',                                                                                          category: 'Sets & Logic', aliases: ['notin', 'not in'] },
  { latex: 'S \\subseteq T',        description: '$S$ is a subset of $T$: every element of $S$ is also in $T$',                                                               category: 'Sets & Logic', aliases: ['subseteq', 'subset'] },
  { latex: 'S \\cup T',             description: 'set union: all elements in $S$ or $T$; $\\bigcup_{i} S_i$ for a collection of sets',                                        category: 'Sets & Logic', aliases: ['cup', 'union'] },
  { latex: 'S \\cap T',             description: 'set intersection: all elements in both $S$ and $T$; $\\bigcap_{i} S_i$ for a collection of sets',                          category: 'Sets & Logic', aliases: ['cap', 'intersection'] },
  { latex: 'S \\setminus T',        description: 'set difference: elements of $S$ that are not in $T$',                                                                       category: 'Sets & Logic', aliases: ['setminus', 'difference'] },
  { latex: '|S|',                   description: 'cardinality of $S$: the number of elements in the set',                                                                     category: 'Sets & Logic', aliases: ['size', 'cardinality'] },
  { latex: '\\emptyset',            description: 'the empty set, containing no elements',                                                                                     category: 'Sets & Logic', aliases: ['empty', 'emptyset'] },
  { latex: '\\{x : P(x)\\}',        description: 'set of all $x$ satisfying condition $P(x)$; e.g. $\\{n \\in \\Z : 5 \\leq n \\leq 10\\} = \\{5,6,7,8,9,10\\}$',         category: 'Sets & Logic', aliases: ['conditional set', 'set builder'] },
  { latex: '\\forall',              description: 'for all; e.g. $x_j \\geq 0\\ \\forall\\ j \\in N$ means every $x_j$ is non-negative',                                     category: 'Sets & Logic', aliases: ['for all'] },
  { latex: '\\Leftrightarrow',      description: 'if and only if (logical equivalence); $P \\Leftrightarrow Q$ means $P$ and $Q$ are logically equivalent',                  category: 'Sets & Logic', aliases: ['iff', 'if and only if', 'leftrightarrow'] },
  { latex: '\\land',                description: 'boolean "and" (conjunction)',                                                                                                category: 'Sets & Logic', aliases: ['and', 'conjunction'] },
  { latex: '\\lor',                 description: 'boolean "or" (disjunction)',                                                                                                category: 'Sets & Logic', aliases: ['or', 'disjunction'] },
  { latex: '\\lnot',                description: 'boolean "not" (negation)',                                                                                                  category: 'Sets & Logic', aliases: ['not', 'negation'] },

  // ── Numbers ───────────────────────────────────────────────────────────────
  { latex: '\\R',                   description: 'the set of real numbers: everything on the number line',                                                                    category: 'Numbers', aliases: ['R', 'real', 'reals'] },
  { latex: '\\R_{\\geq 0}',        description: 'the set of non-negative real numbers',                                                                                      category: 'Numbers', aliases: ['R>=0'] },
  { latex: '\\R_{> 0}',            description: 'the set of positive real numbers',                                                                                          category: 'Numbers', aliases: ['R>0'] },
  { latex: '\\Z',                   description: 'the set of integers',                                                                                                       category: 'Numbers', aliases: ['Z', 'integer', 'integers'] },
  { latex: '\\Z_{\\geq 0}',        description: 'the set of non-negative integers',                                                                                          category: 'Numbers', aliases: ['Z>=0'] },
  { latex: '\\Z_{> 0}',            description: 'the set of positive integers',                                                                                              category: 'Numbers', aliases: ['Z>0'] },

  // ── Vectors & Matrices ────────────────────────────────────────────────────
  { latex: 'S^m',                   description: 'set of $m$-element vectors with entries from $S$; e.g. $\\R^3$ is 3-dimensional real space',                               category: 'Vectors & Matrices', aliases: ['vector', 'power', 'superscript'] },
  { latex: 'S^{m \\times n}',      description: 'set of $m \\times n$ matrices with entries from $S$; e.g. $\\Z^{3 \\times 4}$ is the set of integer $3 \\times 4$ matrices', category: 'Vectors & Matrices', aliases: ['matrix'] },
  { latex: '\\zeros',              description: 'zero matrix (or vector) with all entries equal to 0; size is clear from context',                                           category: 'Vectors & Matrices', aliases: ['zeros', 'zero matrix', 'zero vector'] },
  { latex: '\\identity',           description: 'identity matrix: 1s on the diagonal, 0s elsewhere; size is clear from context',                                            category: 'Vectors & Matrices', aliases: ['identity', 'identity matrix'] },

  // ── Complexity ────────────────────────────────────────────────────────────
  { latex: 'L(X)',                  description: 'the encoding length of a problem instance $X$',                                                                             category: 'Complexity', aliases: ['length', 'encoding length'] },
  { latex: '\\O{g(n)}',            description: 'big-O notation: $f(n) = \\O{g(n)}$ if $|f(n)| \\leq M|g(n)|$ for some $M > 0$ and all large enough $n$',                  category: 'Complexity', aliases: ['big-O', 'big O', 'O'] },
  { latex: 'f_A^*(l)',              description: 'worst-case running time of algorithm $A$ over all instances of length $l$',                                                 category: 'Complexity', aliases: ['runtime', 'running time'] },
  { latex: '\\P',                   description: 'the complexity class $\\P$: decision problems solvable in polynomial time',                                                 category: 'Complexity', aliases: ['P', 'class P'] },
  { latex: '\\NP',                  description: 'the complexity class $\\NP$: decision problems whose solutions are verifiable in polynomial time',                          category: 'Complexity', aliases: ['NP', 'class NP'] },
  { latex: '\\coNP',               description: 'the complexity class $\\coNP$: complements of problems in $\\NP$',                                                          category: 'Complexity', aliases: ['coNP', 'co-NP'] },

  // ── Notation ──────────────────────────────────────────────────────────────
  { latex: '\\floor{x}',           description: 'floor of $x$: round down to the nearest integer; $\\floor{1.7} = 1$',                                                      category: 'Notation', aliases: ['floor'] },
  { latex: '\\ceil{x}',            description: 'ceiling of $x$: round up to the nearest integer; $\\ceil{1.3} = 2$',                                                       category: 'Notation', aliases: ['ceiling', 'ceil'] },
];
