# astro-math-book

An [Astro](https://astro.build) integration for building academic math textbook sites. Provides automatic equation numbering, cross-references, bibliography support, theorem/definition environments, and a responsive textbook layout.

## Installation

```bash
npm install astro-math-book
```

Add the integration to your Astro config:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { mathBook } from 'astro-math-book';

export default defineConfig({
  integrations: [
    mathBook({
      katexMacros: {
        '\\RR': '\\mathbb{R}',
        '\\NN': '\\mathbb{N}',
        '\\eps': '\\varepsilon',
      },
    }),
  ],
});
```

## Features

- **Automatic numbering** — Equations, theorems, definitions, lemmas, figures, and tables are numbered sequentially per chapter (e.g. "2.3").
- **Cross-references** — `<Ref id="thm:main" />` renders a clickable link with a hover tooltip showing the referenced content. Sections can be labeled with `{/* sec:id */}` and referenced as `§1.2`.
- **Math environments** — Styled theorem, definition, lemma, corollary, and remark blocks with optional titles and proof links.
- **Bibliography** — Parse `.bib` files and render formatted citations with hover previews.
- **Sub-equations** — Multi-line aligned equations where each line can be independently labeled and referenced.
- **KaTeX macros** — Custom macros available everywhere in your content.
- **Textbook layout** — Responsive three-column layout with sidebar navigation, table of contents, scroll-spy, theme toggle, font-size controls, and Pagefind search.
- **Print styles** — Dedicated print stylesheet that replaces interactive tooltips with inline content.

---

## Configuration

```ts
mathBook({
  // Custom KaTeX macros available in all math blocks
  katexMacros?: Record<string, string>;

  // Environment types to auto-number (default: Theorem, Definition, Lemma,
  // Corollary, Remark, Figure, Table)
  numberedEnvironments?: string[];
})
```

---

## Layout

Use `BookLayout.astro` as the layout for your chapter pages:

```astro
---
// src/pages/chapters/01-introduction.astro
import BookLayout from 'astro-math-book/BookLayout.astro';
const { headings, remarkPluginFrontmatter } = Astro.props;
---

<BookLayout
  title="Introduction"
  chapter={1}
  headings={headings}
  headingTexts={remarkPluginFrontmatter?.headingTexts}
>
  <slot />
</BookLayout>
```

**Props:**

| Prop | Type | Description |
|---|---|---|
| `title` | `string` | Page title shown in the header and `<title>` tag |
| `chapter` | `number \| string` | Chapter number; use a string like `"A"` for appendices |
| `headings` | `MarkdownHeading[]` | Astro's `headings` export from `.mdx` files |
| `headingTexts` | `string[]` | Heading texts with math, from the remark plugin |
| `currentChapterId` | `string` | Slug of the current chapter for active nav highlighting |

---

## Math Environments

Import components in your MDX files:

```mdx
import { Theorem, Definition, Lemma, Corollary, Remark, Proof, Ref, Equation } from 'astro-math-book/components';
```

### Theorem, Definition, Lemma, Corollary, Remark

All five environments share the same props:

| Prop | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier used for cross-references |
| `title` | `string` | Optional title; supports inline math with `$...$` |
| `number` | `number` | Injected automatically; can be overridden manually |

```mdx
<Theorem id="thm:pythagorean" title="Pythagorean Theorem">
  For a right triangle with legs $a$, $b$ and hypotenuse $c$,

  $$a^2 + b^2 = c^2$$
</Theorem>

<Definition id="def:limit" title="Limit of a Sequence">
  A sequence $(a_n)$ **converges** to $L$ if for every $\varepsilon > 0$
  there exists $N$ such that $n > N$ implies $|a_n - L| < \varepsilon$.
</Definition>

<Lemma id="lem:helper">
  If $f$ is continuous on $[a, b]$ then $f$ is bounded on $[a, b]$.
</Lemma>

<Remark id="rem:note">
  The converse of the above lemma is false in general.
</Remark>
```

### Proof

```mdx
<Proof for="thm:pythagorean">
  Draw the altitude from the right angle to the hypotenuse. The two
  smaller triangles are similar to the original...
</Proof>
```

When `for` is provided, the proof block is labeled "Proof of Theorem 2.3" and a backlink from the theorem to the proof is generated automatically.

---

## Equations

Label display math blocks with `{#id}` after the closing `$$`:

```mdx
$$
  e^{i\pi} + 1 = 0
$$ {#eq:euler}
```

The block is automatically numbered and can be referenced with `<Ref id="eq:euler" />`.

To display a custom label instead of a number, use `{#id|Label}`:

```mdx
$$
  \int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$ {#eq:gaussian|★}
```

### Sub-equations

Use `<SubEquations>` for multi-line aligned equation groups where each line needs its own number:

```mdx
import { SubEquations } from 'astro-math-book/components';

<SubEquations rows={[
  { id: 'eq:fx', left: 'f(x)', right: '\\sin(x) + \\cos(x)' },
  { id: 'eq:gx', left: 'g(x)', right: 'e^{-x^2}' },
]} />
```

Each row's `id` can be passed to `<Ref>` independently.

---

## Cross-references

`<Ref id="..." />` renders a hyperlink to the labeled item. Hovering shows a tooltip with the item's content.

```mdx
By <Ref id="thm:pythagorean" />, we have $a^2 + b^2 = c^2$.

Substituting into <Ref id="eq:euler" /> gives...

See also <Ref id="fig:diagram" /> for a visual illustration.
```

The link text is generated automatically from the registry (e.g. "Theorem 2.3", "equation (2.3)", "Figure 2.1").

---

## Section references

Place a JSX comment `{/* sec:id */}` at the end of any heading to make it referenceable:

```mdx
## Limits of Functions {/* sec:limits */}

## Continuity {/* sec:continuity */}

### The $\varepsilon$-$\delta$ Definition {/* sec:epsilon-delta */}
```

The comment is stripped from the rendered heading text and the heading's HTML anchor is set to the custom id. Reference the section with `<Ref>` as usual:

```mdx
By <Ref id="sec:limits" />, we have...

The definition is recalled in <Ref id="sec:continuity" />.
```

`<Ref id="sec:limits" />` renders as `§1.1` (using the section symbol) with a hover tooltip showing the section title. Hovering reveals "**Section 1.1**: Limits of Functions".

Section numbers are assigned sequentially per chapter in document order, using a counter that is **independent** of the theorem/equation counter. The first labeled section in chapter 1 is `1.1`, the second is `1.2`, and so on.

---

## Annotated align blocks

`<AnnotatedAlign>` renders a multi-line aligned equation block (like `align*`) where each line can carry an optional reasoning annotation revealed by clicking a small **?** button next to the line.

```mdx
import { AnnotatedAlign } from 'astro-math-book/components';

<AnnotatedAlign rows={[
  {
    math: '(a + b)^2 &= a^2 + 2ab + b^2',
    reason: 'Expand using the binomial identity',
  },
  {
    math: '&\\geq 2ab',
    reason: '$a^2 + b^2 \\geq 0$, so we can drop those terms',
  },
  {
    math: '&\\geq 0',
  },
]} />
```

Use `&` to mark the alignment point, exactly as in LaTeX `align*`. Multiple alignment points per line are supported — columns alternate right-aligned / left-aligned, matching LaTeX's convention:

```mdx
<AnnotatedAlign rows={[
  {
    math: 'f(x) &= x^2 + 1  &  g(x) &= x^3 - x',
    reason: 'Definitions',
  },
  {
    math: "f'(x) &= 2x  &  g'(x) &= 3x^2 - 1",
    reason: 'Differentiate each with respect to $x$',
  },
]} />
```

**Row props:**

| Prop | Type | Description |
|---|---|---|
| `math` | `string` | Row content with `&` as alignment separators |
| `reason` | `string` | Optional annotation; supports `$...$` inline math |
| `id` | `string` | Optional anchor id for cross-referencing with `<Ref>` |

If no rows have a `reason`, the `?` button column is omitted entirely and the block renders as a plain aligned display.

---

## Figures and Tables

```mdx
import { Figure, Table } from 'astro-math-book/components';

<Figure id="fig:diagram" caption="A right triangle with legs $a$ and $b$.">
  <img src="/images/triangle.svg" alt="right triangle" />
</Figure>

<Table id="tab:values" caption="Values of $\sin$ and $\cos$ at common angles.">
  | $\theta$ | $\sin\theta$ | $\cos\theta$ |
  |---|---|---|
  | $0$ | $0$ | $1$ |
  | $\pi/6$ | $1/2$ | $\sqrt{3}/2$ |
  | $\pi/2$ | $1$ | $0$ |
</Table>
```

Both components are numbered automatically and support `<Ref>` links.

### Dark mode and figures

Inline SVGs can reference theme CSS variables directly in `style` attributes or via CSS classes:

| Variable | Value |
|---|---|
| `--text` | Primary text colour |
| `--text-muted` | Secondary/muted text |
| `--bg` | Page background |
| `--border` | Border colour |

The simplest approach for monochrome diagrams is `currentColor` — set `color` on the `<svg>` element and use `fill="currentColor"` / `stroke="currentColor"` on child elements:

```svg
<svg style="color: var(--text)" ...>
  <path fill="currentColor" d="..." />
  <line stroke="currentColor" ... />
</svg>
```

For multi-colour diagrams, use the SVG paint utility classes on individual elements:

```svg
<circle class="svg-fill-bg svg-stroke-text" ... />
<line class="svg-stroke-muted" ... />
```

Available classes: `.svg-fill-text`, `.svg-fill-muted`, `.svg-fill-bg`, `.svg-fill-border`, `.svg-stroke-text`, `.svg-stroke-muted`, `.svg-stroke-bg`.

For raster images or externally-authored SVGs, the `invertInDark` prop on `<Figure>` applies `filter: invert(1) hue-rotate(180deg)` in dark mode, which works well for black-on-white plots and diagrams:

```mdx
<Figure id="fig:plot" caption="A convergent sequence." invertInDark>
  <img src="/images/plot.png" alt="convergent sequence" />
</Figure>
```

The same effect is available as a plain CSS class `.invert-in-dark` for use outside of `<Figure>`.

---

## Bibliography

### 1. Add a `.bib` file

Place `references.bib` in the root of your project:

```bibtex
@book{rudin1976,
  author    = {Rudin, Walter},
  title     = {Principles of Mathematical Analysis},
  year      = {1976},
  publisher = {McGraw-Hill},
  edition   = {3rd},
  image     = {/covers/rudin.jpg},
}

@article{euler1748,
  author  = {Euler, Leonhard},
  title   = {Introductio in analysin infinitorum},
  year    = {1748},
  journal = {Opera Omnia},
}
```

The optional `image` field sets a cover image shown in citation tooltips.

### 2. Cite inline

```mdx
import { Cite, Bibliography } from 'astro-math-book/components';

This result is proved in <Cite id="rudin1976" />.

For the original treatment, see <Cite id="euler1748" page="112" />.
```

### 3. Render the bibliography

```mdx
## References

<Bibliography />
```

`<Bibliography />` renders all entries from `references.bib`, sorted alphabetically by author and year.

---

## Footnotes

Footnotes use two paired components: `<Footnote />` marks the location in the text, and `<FootnoteBody>` holds the content. Numbering is assigned automatically in document order by the remark plugin — you never set `number` manually.

```mdx
import { Footnote, FootnoteBody } from 'astro-math-book/components';

A continuous function cannot skip values.<Footnote />

<FootnoteBody>
  This topological property characterises connected sets: a subset $E \subset \mathbb{R}$
  is connected if and only if every continuous $f : E \to \mathbb{R}$ has the
  intermediate value property.
</FootnoteBody>
```

`<FootnoteBody>` accepts arbitrary MDX content — multiple paragraphs, display math, and other components are all supported:

```mdx
The sequence converges to $\pi$.<Footnote />

<FootnoteBody>
  The irrationality of $\pi$ was first proved by Lambert in 1761.
  A more elementary proof uses the integral

  $$
    \int_0^1 x^n(1-x)^n\,dx.
  $$
</FootnoteBody>
```

On hover (desktop) the content appears in a tooltip; on touch devices it opens in a bottom sheet. The rendered tooltip prepends a `[n]` marker so the reader can see which footnote is being shown.

The `<FootnoteBody>` block can appear anywhere after its corresponding `<Footnote />` marker — it is invisible in the normal page flow.

---

## Styles

Import the provided stylesheets in your layout or globally:

```astro
---
import 'astro-math-book/styles/global.css';
import 'astro-math-book/styles/math.css';
import 'astro-math-book/styles/print.css';
---
```

`BookLayout.astro` imports these automatically.

---

## Advanced: Individual Integrations

`mathBook()` is a convenience wrapper. You can also compose the pieces individually:

```js
import {
  registryIntegration,
  bibliographyIntegration,
  remarkSectionRefs,
  remarkEquations,
  remarkNumberEnvs,
  remarkHeadingTexts,
} from 'astro-math-book';

export default defineConfig({
  integrations: [
    registryIntegration(),
    bibliographyIntegration(),
  ],
  markdown: {
    remarkPlugins: [
      remarkSectionRefs,
      remarkHeadingTexts,
      remarkEquations,
      remarkNumberEnvs,
    ],
  },
});
```

### Registry

`registryIntegration` scans `src/content/chapters/*.mdx` during the build and writes `src/lib/registry.json`. Each entry looks like:

```ts
interface RegistryEntry {
  id: string;          // e.g. "thm:main"
  type: string;        // "Theorem" | "Equation" | "Figure" | ...
  number: string;      // "2.3"
  label?: string;      // custom label, e.g. "★"
  title?: string;      // environment title
  chapter: number | string;
  contentHTML: string; // serialized HTML used in Ref tooltips
  href: string;        // "/chapters/slug#id"
  proofHref?: string;  // link to associated proof
}
```

### NumberingProvider

When you need to number environments inside plain React components (outside MDX), use `NumberingProvider`:

```tsx
import { NumberingProvider, useNumberingContext, Theorem } from 'astro-math-book/components';

function MySection() {
  return (
    <NumberingProvider>
      <Inner />
    </NumberingProvider>
  );
}

function Inner() {
  const { getNumber } = useNumberingContext();
  const n = getNumber('Theorem');
  return <Theorem id="thm:local" number={n}>...</Theorem>;
}
```

### PrintFallback

Wrap content that should only appear in print output (e.g. expanded reference lists):

```mdx
import { PrintFallback } from 'astro-math-book/components';

<PrintFallback>
  This text only appears when the page is printed.
</PrintFallback>
```

---

## Virtual Modules

Three virtual modules are available in your components and pages:

```ts
import { katexMacros } from 'virtual:astro-math-book/katex-macros';
// Record<string, string>

import registry from 'virtual:astro-math-book/registry';
// Record<string, RegistryEntry>

import bibliography from 'virtual:astro-math-book/bibliography';
// Record<string, BibEntry>
```

TypeScript types are provided automatically via `src/virtual.d.ts`.

---

## Peer Dependencies

| Package | Version |
|---|---|
| `astro` | `>=4.0.0` |
| `react` | `>=18.0.0` |
| `react-dom` | `>=18.0.0` |
