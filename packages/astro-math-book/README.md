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
- **Textbook layout** — Responsive three-column layout with sidebar navigation, table of contents, scroll-spy, theme toggle, and font-size controls.
- **Unified search** — ⌘K command palette combining instant registry search (theorems, definitions, equations) with full-text Pagefind prose search.
- **Print styles** — Dedicated print stylesheet that replaces interactive tooltips with inline content.

---

## Configuration

```ts
mathBook({
  // Custom KaTeX macros available in all math blocks
  katexMacros?: Record<string, string>;

  // Environment types to auto-number (default: Theorem, Definition, Lemma,
  // Corollary, Remark, Figure, Table). Replaces the default list entirely.
  numberedEnvironments?: string[];

  // Additional numbered, referenceable environments. Merged with the defaults —
  // existing built-in environments are unaffected.
  environments?: EnvDescriptor[];
})
```

### Defining custom environments

Each entry in `environments` describes a new numbered, referenceable JSX component:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { mathBook } from 'astro-math-book';

export default defineConfig({
  integrations: [
    mathBook({
      environments: [
        {
          // Name of the JSX component used in MDX (required)
          name: 'Example',

          // Registry type string used in Ref labels, e.g. "Example 2.3" (defaults to name)
          type: 'Example',

          // Optional: control what HTML is stored in the registry for Ref tooltips.
          // Receives the raw MDX AST node and serialisation helpers.
          // Defaults to serialising the component's children.
          collectContent: (node, { getAttrString, nodesToHtml }) => ({
            title: getAttrString(node.attributes, 'title') ?? undefined,
            contentHTML: nodesToHtml(node.children),
          }),
        },
        { name: 'Exercise' },
      ],
    }),
  ],
});
```

Once registered, the integration automatically:
- Assigns chapter-prefixed numbers (e.g. `2.3`) via the remark plugin
- Writes a registry entry so `<Ref id="ex:myexample" />` renders "Example 2.3" with a hover tooltip

You still need to write the React component itself and export it from your site. Use `createMathEnv` to get the same look and behaviour as the built-in environments in one line:

```tsx
// src/components/Example.tsx
import { createMathEnv } from 'astro-math-book/components';
export const Example = createMathEnv('Example');
```

`createMathEnv(type, cssKey?)` returns a component that accepts `id`, `title`, `number`, and `children`. The optional `cssKey` overrides the CSS modifier class (defaults to `type.toLowerCase()`), useful when your display name contains spaces or mixed case.

To style the `<Ref>` tooltip border and background, add CSS variables matching the type name (lowercased):

```css
:root {
  --env-example-border: #a0c4ff;
  --env-example-bg: #eef4ff;
}
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

## Search

`BookLayout.astro` includes a unified search modal automatically — no setup required. Open it with **⌘K** (Mac) / **Ctrl+K** (Windows/Linux), or with the **Search…** button in the sidebar.

### Registry search (always available)

The modal instantly searches all numbered environments — theorems, definitions, lemmas, equations, figures, etc. — directly from the registry built at compile time. Results appear as you type with a content preview below each entry.

Results are ranked by how closely the query matches the environment's label, title, type+number, and body text.

### Full-text prose search (production only)

When a production build is served, the modal also searches the full page text via the [Pagefind](https://pagefind.app) JavaScript API. Results appear in an "In text" section below the environment results after a short debounce.

> Full-text search requires the Pagefind index (`/pagefind/`) generated by `npm run build`. It is unavailable in `npm run dev` because the index doesn't exist yet — only environment search runs in development.

### Keyboard navigation

| Key | Action |
|---|---|
| `↑` / `↓` | Move between results |
| `↵` | Navigate to selected result |
| `Esc` | Close the modal |

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
| `alt` | `string` | (`Definition` only) Alternate terms, separated by `\|`; supports `$...$` inline math. See [Glossary](#glossary). |
| `label` | `string` | Optional custom reference text; replaces `"Theorem 2.3"` in `<Ref>` output |
| `number` | `number` | Injected automatically; can be overridden manually |

When `label` is set, `<Ref id="...">` renders the label as the complete link text instead of the default `"Type N.M"`. The hover tooltip still shows the canonical number and full content, so the reader can always locate the item in the text.

```mdx
<Theorem id="thm:bolzano" title="Bolzano–Weierstrass" label="BWT">
  Every bounded sequence in $\mathbb{R}$ has a convergent subsequence.
</Theorem>

By <Ref id="thm:bolzano" />, every bounded sequence has a convergent subsequence.
{/* renders: "By BWT, every bounded sequence..." */}
```

`label` is also supported on `Definition`, `Lemma`, `Corollary`, `Remark`, `Figure`, `Table`, `Algorithm`, and any custom environment registered via `environments`.

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

### BlockQuote

Use `<BlockQuote>` for passages in the main exposition quoted from another source. The optional `attribution` prop renders a right-aligned attribution line preceded by an em dash.

```mdx
import { BlockQuote } from 'astro-math-book/components';

<BlockQuote attribution="Weierstrass, letter to du Bois-Reymond (1873)">
  It is true that a mathematician who is not also something of a poet will never
  be a complete mathematician.
</BlockQuote>
```

The body supports arbitrary MDX content (multiple paragraphs, inline math, etc.). If `attribution` is omitted the block renders as a plain indented quote with no footer.

---

### createMathEnv

All five built-in theorem-like environments are generated by `createMathEnv`. You can use it to create additional ones with the same visual style:

```tsx
import { createMathEnv } from 'astro-math-book/components';

export const Example = createMathEnv('Example');
export const Exercise = createMathEnv('Exercise');
```

Remember to also register the environment in `astro.config.mjs` so it receives automatic numbering and `<Ref>` support — see [Defining custom environments](#defining-custom-environments) above.

### createFloatEnv

Figure, Table, and Algorithm are all generated by `createFloatEnv`. Use it to create additional float environments (things with a caption label, numbered independently, without a proof link):

```tsx
import { createFloatEnv } from 'astro-math-book/components';

export const Listing = createFloatEnv('Listing', { captionPosition: 'top' });
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `captionPosition` | `'top' \| 'bottom'` | `'bottom'` | Whether the caption appears above or below the content |
| `cssPrefix` | `string` | `math-{type.toLowerCase()}` | CSS class prefix; generates `{prefix}`, `{prefix}-caption`, `{prefix}-content` |

The component accepts `id`, `caption`, `captionNode`, `number`, `invertInDark`, and `children`. For captions that need JSX (e.g. a `<Ref>`), use the `captionNode` prop — see [Captions with cross-references](#captions-with-cross-references). Register it with `kind: 'float'` so the registry uses `caption` (not `title`) for tooltip extraction and `<Ref>` renders caption-style labels:

```js
environments: [{ name: 'Listing', kind: 'float' }]
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

Use `altLabel` to override the link text for a specific reference without changing the registry entry. Inline math with `$...$` is supported:

```mdx
As shown in <Ref id="thm:pythagorean" altLabel="the theorem above" />, ...
{/* renders: "As shown in the theorem above, ..." */}

By <Ref id="def:limit" altLabel="the definition of $L^2$" />, ...
```

The hover tooltip still shows the canonical number and full content regardless of `altLabel`.

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

### Captions with cross-references

The `caption` prop accepts a plain string (with `$...$` inline math). When the caption needs JSX — for example a `<Ref>` cross-reference — use the `captionNode` prop instead. Astro pre-renders children of server-rendered React components before the parent runs, so child-based approaches cannot work; the `captionNode` prop is passed as an Astro JSX descriptor and converted to a React element at render time.

`captionNode` works on `<Figure>`, `<Table>`, `<Algorithm>`, and any custom `createFloatEnv` component.

```mdx
import { Figure, Table, Ref } from 'astro-math-book/components';

<Figure id="fig:example2" captionNode={<>A continuation of <Ref id="fig:example" />.</>}>
  <img src="/images/example2.svg" alt="..." />
</Figure>

<Table id="tab:comparison" captionNode={<>Comparison with the values from <Ref id="tab:baseline" />.</>}>
  | ... |
</Table>
```

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

## Algorithms

`<Algorithm>` renders a numbered float with a top caption and horizontal rule styling. Use the pseudocode line components inside it to write structured, auto-numbered algorithms.

```mdx
import {
  Algorithm,
  AlgoInput, AlgoOutput,
  AlgoStep, AlgoReturn, AlgoComment,
  AlgoFor, AlgoWhile,
  AlgoIf, AlgoElseIf, AlgoElse,
} from 'astro-math-book/components';

<Algorithm id="alg:bfs" caption="Breadth-First Search">
  <AlgoInput>Graph $G = (V, E)$, source vertex $s$</AlgoInput>
  <AlgoOutput>Distance array $d$</AlgoOutput>
  <AlgoStep>$d[s] \gets 0$; add $s$ to queue $Q$</AlgoStep>
  <AlgoWhile cond="$Q$ is not empty">
    <AlgoStep>$u \gets \operatorname{Dequeue}(Q)$</AlgoStep>
    <AlgoFor each="neighbor $v$ of $u$">
      <AlgoIf cond="$d[v] = \infty$">
        <AlgoStep>$d[v] \gets d[u] + 1$</AlgoStep>
        <AlgoComment>enqueue $v$ for later processing</AlgoComment>
        <AlgoStep>$\operatorname{Enqueue}(v, Q)$</AlgoStep>
      </AlgoIf>
    </AlgoFor>
  </AlgoWhile>
  <AlgoReturn>$d$</AlgoReturn>
</Algorithm>
```

Reference the algorithm with `<Ref id="alg:bfs" />` → "Algorithm 2.1".

### Pseudocode components

**Statements** (each gets an auto-incremented line number):

| Component | Renders as |
|---|---|
| `<AlgoStep>` | Plain statement |
| `<AlgoReturn>` | **return** … |
| `<AlgoFor each="…">` | **for** … **do** |
| `<AlgoWhile cond="…">` | **while** … **do** |
| `<AlgoIf cond="…">` | **if** … **then** |
| `<AlgoElseIf cond="…">` | **else if** … **then** |
| `<AlgoElse>` | **else** |

Children of `<AlgoFor>`, `<AlgoWhile>`, `<AlgoIf>`, `<AlgoElseIf>`, and `<AlgoElse>` are automatically indented. No explicit end markers are needed — structure is communicated by indentation (CLRS style).

**Unnumbered lines:**

| Component | Renders as |
|---|---|
| `<AlgoComment>` | ▷ _italic annotation_ (no line number) |
| `<AlgoInput>` | **Input:** … (metadata, before numbered body) |
| `<AlgoOutput>` | **Output:** … (metadata, before numbered body) |

The `cond` and `each` props on control-flow components are strings and support `$…$` inline math, the same as the `title` prop on theorem environments. Children of statement components are regular MDX content and also support math.

Line numbers are assigned by a CSS counter reset on the algorithm container, so they work correctly regardless of nesting depth and require no JavaScript.

---

## YouTube Embeds

`<YouTubeEmbed>` renders a responsive embedded video with an automatic print fallback (thumbnail + watch URL).

```mdx
import { YouTubeEmbed } from 'astro-math-book/components';

<YouTubeEmbed
  videoId="dQw4w9WgXcQ"
  id="vid:example"
  number="1.1"
  caption="A motivating example."
/>
```

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `videoId` | `string` | — | YouTube video ID (required) |
| `id` | `string` | — | Anchor id for cross-references with `<Ref>` |
| `number` | `string` | — | Label shown in the figcaption, e.g. `"1.1"` |
| `caption` | `string` | — | Caption text shown below the video |
| `title` | `string` | `'YouTube video'` | Accessible title for the iframe |
| `aspectRatio` | `'16/9' \| '4/3'` | `'16/9'` | Aspect ratio of the embed |
| `start` | `number` | — | Start time in seconds |
| `end` | `number` | — | End time in seconds |
| `controls` | `boolean` | `true` | Show player controls |
| `autoplay` | `boolean` | `false` | Autoplay the video |
| `muted` | `boolean` | `false` | Mute the video |
| `loop` | `boolean` | `false` | Loop the video |

When `id` is provided the embed can be cross-referenced with `<Ref id="vid:example" />`. In print output the iframe is replaced by a thumbnail image and a `youtu.be` short link; if `start` or `end` are set, a formatted timestamp range (e.g. `1:30–2:45`) is appended to the link.

---

## Colab Embeds

`<ColabEmbed>` renders a read-only notebook preview (via [nbviewer](https://nbviewer.org)) with an "Open in Colab" badge overlaid in the top-right corner. On print the iframe is replaced by a direct Colab link.

The notebook must be publicly accessible on GitHub. Both the nbviewer URL and the Colab URL are derived automatically from the GitHub URL — no manual URL construction needed.

```mdx
import { ColabEmbed } from 'astro-math-book/components';

<ColabEmbed
  url="https://github.com/you/repo/blob/main/notebooks/intro.ipynb"
  caption="Numerical verification of the convergence rate."
  height={500}
/>
```

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | — | GitHub URL to the `.ipynb` file (required) |
| `caption` | `string` | — | Caption text shown below the embed |
| `height` | `number` | `600` | Height of the iframe in pixels |

**Print output:** the iframe and badge are hidden; a plain `Colab URL: <link>` line is shown instead.

**Private notebooks:** nbviewer can only fetch public repositories. If the notebook is private the preview pane will show a "Not Found" error, but the "Open in Colab" badge still works — Colab authenticates with the reader's Google account.

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

## Glossary

`<Glossary />` renders an alphabetical index of all `<Definition>` environments that have a `title` prop.

```mdx
import { Glossary } from 'astro-math-book/components';

<Glossary />
```

Each entry shows the definition title linking back to the definition in the text, with the definition body below it.

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `sortBy` | `'alpha' \| 'chapter'` | `'alpha'` | Sort order: alphabetical by term, or by definition number |

### Alternate terms

Use the `alt` prop on `<Definition>` to add alternate names that should also appear in the glossary. The value is a `|`-separated string; each term supports `$...$` inline math.

```mdx
<Definition id="def:sigma-algebra" title="$\sigma$-algebra" alt="sigma field | $\sigma$-field">
  A collection of subsets of $\Omega$ closed under complement and countable union...
</Definition>
```

In the glossary, each alt term gets its own alphabetically-sorted entry displaying "See [$\sigma$-algebra](#glossary-def:sigma-algebra)" linking to the primary entry.

Alt terms are also matched in the registry search (⌘K), at the same priority as exact title matches.

> **Note:** Because `alt` is a plain JSX string attribute (no curly braces), backslashes in LaTeX commands are preserved as-is. Do not write `alt={["$\\sigma$-field"]}` — use the string form `alt="$\sigma$-field"` instead.

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

### Matching by id

When several footnotes appear close together it can be hard to tell which `<FootnoteBody>` belongs to which `<Footnote />` by position alone. Give both the same `id` string and the plugin will pair them explicitly, regardless of the order the bodies appear in the file:

```mdx
The primal problem has a finite optimum<Footnote id="fn:primal"/> and so
does the dual<Footnote id="fn:dual"/>.

<FootnoteBody id="fn:dual">
  The dual bound follows from weak duality applied to any feasible primal solution.
</FootnoteBody>

<FootnoteBody id="fn:primal">
  Finiteness requires the feasible region to be non-empty and bounded below.
</FootnoteBody>
```

Both components accept an optional `id` prop. Markers without an `id` are still paired with bodies without an `id` in document order as usual. The `id` is local to the file — the same string can be reused in a different chapter without conflict.

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

## PDF Export

Run from the book project root:

```bash
npm run pdf
```

This builds the site, starts a local preview server, and uses Puppeteer + Chromium to print each chapter to PDF. Two sets of files are produced:

| Path | Contents |
|---|---|
| `pdfs/<Book Title>.pdf` | Single combined PDF of the whole book |
| `pdfs/chapters/<slug>.pdf` | One PDF per chapter |

The combined PDF includes:

- **Table of contents** — inserted at the front, with dot leaders and clickable links to every chapter, section, and subsection. TOC pages are numbered with lowercase Roman numerals (i, ii, …).
- **Bookmarks** — a PDF outline tree with numbered entries (e.g. "1.2  Sequences and Series") so readers can navigate via the viewer's sidebar.
- **Page numbers** — centred in the bottom margin. TOC pages use Roman numerals; content pages use "1 / N" style.
- **Resolved internal links** — all `<Ref>` and cross-reference links become internal GoTo destinations. Within-chapter links navigate within the page; cross-chapter links jump to the correct page in the merged document.

In individual chapter PDFs, within-chapter links work natively. Cross-chapter links (which cannot navigate to pages not in that file) are removed rather than left as dead browser-opening URIs.

The entire `pdfs/` directory is deleted and recreated at the start of each run, so any files you have placed there manually will be lost.

The `pdfs/` directory is listed in `.gitignore` — generated PDFs are not committed to the repository.

### Requirements

Chromium or Google Chrome must be installed and on `PATH`. The script checks for `google-chrome`, `google-chrome-stable`, `chromium`, and `chromium-browser` in that order.

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
  alt?: string[];      // alternate terms (Definition only); from the |-separated alt prop
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

`<PrintFallback>` has two distinct uses depending on where it appears.

**Standalone** — the wrapped content is hidden on screen and visible only when printing:

```mdx
import { PrintFallback } from 'astro-math-book/components';

<PrintFallback>
  This text only appears when the page is printed.
</PrintFallback>
```

**Inside a float environment** — when `<PrintFallback>` is a direct child of a float's content wrapper (i.e. inside `<Figure>`, `<Table>`, `<Algorithm>`, or any `createFloatEnv` component), CSS automatically swaps the two on print: the fallback becomes visible *and* every sibling element is hidden. This lets you provide a screen version and a print version of the same float without duplicating the caption or number:

```mdx
<Figure id="fig:animation" caption="Convergence of the sequence.">
  <video src="/anim.mp4" autoplay loop muted />
  <PrintFallback>
    <img src="/anim-still.png" alt="Final frame showing convergence" />
  </PrintFallback>
</Figure>
```

On screen the video plays; on print the video is hidden and the still image takes its place. The figcaption and figure number are unaffected either way.

The mechanism is pure CSS — no JavaScript involved:

```css
/* screen: hide the fallback */
.print-fallback { display: none; }

@media print {
  /* print: show the fallback... */
  .print-fallback { display: block; }

  /* ...and hide its interactive siblings */
  .math-float-content:has(.print-fallback) > *:not(.print-fallback) { display: none; }
}
```

The same pattern works inside any `createFloatEnv` component because they all use a `{cssPrefix}-content` wrapper div whose class the `:has()` selector targets.

### PrintExtra

`<PrintExtra>` is the complement to `<PrintFallback>`: the wrapped content is hidden on screen and shown only when printing, but **without hiding any sibling elements**. Use it to append print-only content alongside the existing content rather than replacing it.

```mdx
import { PrintExtra } from 'astro-math-book/components';

<Figure id="fig:animation" caption="Convergence of the sequence.">
  <video src="/anim.mp4" autoplay loop muted />
  <PrintExtra>
    <img src="/anim-still.png" alt="Final frame showing convergence" />
  </PrintExtra>
</Figure>
```

On screen only the video is shown. On print both the video element (hidden by the browser's default print behaviour for media) and the still image appear — or more precisely, the still image is added alongside whatever the browser chooses to render from the siblings.

For a clean swap (show one thing on screen, a different thing on print), use `<PrintFallback>` instead.

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
