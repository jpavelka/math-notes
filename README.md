# math-notes

An academic math textbook site built with [Astro](https://astro.build) and the `astro-math-book` framework package. Provides automatic equation numbering, cross-references, theorem environments, bibliography, and a responsive textbook layout.

## Structure

```
packages/astro-math-book/   # Shared framework package
book/                       # The book content and Astro project
  content/                  # MDX chapter files
  config.ts                 # Title and short title
  katex-macros.ts           # Custom KaTeX macros
  references.bib            # Bibliography
```

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321).

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview the production build |
| `npm run pdf` | Export all chapters to PDF |

## Documentation

Framework component and API reference: [`packages/astro-math-book/README.md`](packages/astro-math-book/README.md)
