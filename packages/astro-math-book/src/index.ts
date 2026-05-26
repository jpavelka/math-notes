/**
 * astro-math-book — Astro integration for academic math textbook sites.
 *
 * Provides:
 *   - registryIntegration(): builds cross-reference registry at build time
 *   - bibliographyIntegration(): parses .bib files at build time
 *   - remarkEquations: transforms labeled display math into <Equation> JSX
 *   - remarkNumberEnvs: injects number props onto math environments
 *   - remarkSectionRefs: strips {#id} labels from headings and sets anchor ids
 *   - remarkHeadingTexts: captures heading text (with math) for TOC rendering
 *   - mathBook(): convenience integration that wires everything together
 */

export { registryIntegration } from './plugins/astro-registry.mjs';
export { bibliographyIntegration } from './plugins/bibliography.mjs';
export { remarkEquations } from './plugins/remark-equations.mjs';
export { remarkNumberEnvs } from './plugins/remark-number-envs.mjs';
export { remarkHeadingTexts } from './plugins/remark-heading-texts.mjs';
export { remarkSectionRefs } from './plugins/remark-section-refs.mjs';
export { mathBook } from './integration.mjs';
export { chapterSchema } from './schema';
