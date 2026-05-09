# math-notes

A monorepo for building academic math textbook sites with [Astro](https://astro.build). The shared `astro-math-book` package provides the framework — automatic equation numbering, cross-references, theorem environments, bibliography, and a responsive textbook layout. Individual books live under `sites/`.

## Structure

```
packages/
  astro-math-book/       # Shared framework package
    src/components/      # Layout and math environment components
    src/plugins/         # Remark plugins (numbering, equations, refs)
    src/styles/          # Global, math, and print stylesheets
    scripts/pdf.ts       # PDF export script
sites/
  sample/                # A sample book (Real Analysis)
    src/content/chapters/  # MDX chapter files
    src/config.ts          # Site title and other site-level config
    src/lib/katex-macros.ts
    astro.config.mjs
```

## Quick start

```bash
npm install
npm run dev
```

The dev server starts for the active site (currently `sites/sample`). Open [http://localhost:4321](http://localhost:4321).

## Creating a new site

1. Copy `sites/sample` to a new folder, e.g. `sites/my-book`
2. Give it a unique name in its `package.json`: `"name": "my-book-site"`
3. Update `src/config.ts` with your title
4. Update the root `package.json` scripts to point to `sites/my-book`
5. Run `npm install` to register the new workspace

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview the production build |
| `npm run pdf` | Export all chapters to PDF |

## Documentation

Full component and API reference: [`packages/astro-math-book/README.md`](packages/astro-math-book/README.md)
