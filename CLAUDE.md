# CLAUDE.md

## Repo layout

```
packages/astro-math-book/   # Framework package — components, plugins, styles
book/                       # The book — a self-contained Astro project
  astro.config.mjs
  package.json
  tsconfig.json
  config.ts                 # SITE_TITLE, SITE_TITLE_SHORT
  katex-macros.ts           # KaTeX macros
  references.bib            # BibTeX references
  content/                  # MDX chapter files
  src/
    content.config.ts
    components/math/        # Re-exports from astro-math-book
    pages/
      index.astro           # Redirects to first chapter
      [...slug].astro       # Chapter pages (URL: /{chapter-id})
```

## Commands

```bash
npm run dev      # dev server at http://localhost:4321
npm run build    # production build
npm run preview  # preview the production build
npm run pdf      # export chapters to PDF via Puppeteer
```

## Generated files — do not edit directly

- `book/.astro/registry.json` — written by `registryIntegration` during build/dev
- `book/.astro/bibliography.json` — written by `bibliographyIntegration` during build/dev

## Build pipeline

MDX files flow through several remark plugins before rendering:

1. `remark-section-refs` — turns `{/* sec:id */}` comments into heading anchors
2. `remark-heading-texts` — extracts heading text (with math) for the ToC
3. `remark-equations` — numbers display math blocks and handles `{#id}` labels
4. `remark-number-envs` — assigns chapter-prefixed numbers to Theorem/Definition/etc. environments and writes entries to `registry.json`

`<Ref>` tooltips are powered by `registry.json` at runtime.

## Framework vs. content changes

| What you're changing | Where to edit |
|---|---|
| Component behaviour/styling | `packages/astro-math-book/src/components/` |
| Numbering or MDX transform logic | `packages/astro-math-book/src/plugins/` |
| Stylesheets | `packages/astro-math-book/src/styles/` |
| Chapter content | `book/content/*.mdx` |
| Book title, short title | `book/config.ts` |
| KaTeX macros | `book/katex-macros.ts` |
| Bibliography | `book/references.bib` |

## Adding a new math environment component

1. Create the `.tsx` file in `packages/astro-math-book/src/components/math/`
2. Export it from `packages/astro-math-book/src/components/math/index.ts`
3. If it needs a registry entry (i.e. supports `<Ref>`), add numbering logic in `remark-number-envs.mjs`
