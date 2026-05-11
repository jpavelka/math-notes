# CLAUDE.md

## Repo layout

```
packages/astro-math-book/   # Framework package — components, plugins, styles
sites/sample/               # The active book site (Real Analysis sample)
```

All `npm run` scripts at the root target `sites/sample`. To work on a different site, pass `--workspace=sites/<name>` explicitly.

## Commands

```bash
npm run dev       # dev server at http://localhost:4321
npm run build     # production build
npm run pdf       # export chapters to PDF via Puppeteer
```

## Generated files — do not edit directly

- `sites/sample/src/lib/registry.json` — written by `registryIntegration` during build/dev. Editing it by hand will be overwritten on the next build.

## Build pipeline

MDX files flow through several remark plugins before rendering:

1. `remark-section-refs` — turns `{/* sec:id */}` comments into heading anchors
2. `remark-heading-texts` — extracts heading text (with math) for the ToC
3. `remark-equations` — numbers display math blocks and handles `{#id}` labels
4. `remark-number-envs` — assigns chapter-prefixed numbers to Theorem/Definition/etc. environments and writes entries to `registry.json`

`<Ref>` tooltips are powered by `registry.json` at runtime. If cross-references look wrong, the pipeline above is where to look.

## Framework vs. content changes

| What you're changing | Where to edit |
|---|---|
| Component behaviour/styling | `packages/astro-math-book/src/components/` |
| Numbering or MDX transform logic | `packages/astro-math-book/src/plugins/` |
| Stylesheets | `packages/astro-math-book/src/styles/` |
| Chapter content | `sites/sample/src/content/chapters/*.mdx` |
| Site config, KaTeX macros | `sites/sample/src/config.ts`, `src/lib/katex-macros.ts` |

## Adding a new component

1. Create the `.tsx` file in `packages/astro-math-book/src/components/math/`
2. Export it from `packages/astro-math-book/src/components/math/index.ts`
3. If it needs a registry entry (i.e. supports `<Ref>`), add numbering logic in `remark-number-envs.mjs`
