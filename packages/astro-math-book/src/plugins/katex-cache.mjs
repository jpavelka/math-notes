/**
 * Patches katex.renderToString with a process-lifetime cache.
 * Import this module once (e.g. in integration.mjs) before any rehype-katex
 * calls. Subsequent renders of the same expression + display-mode combination
 * are served from the cache, which persists across Vite HMR recompilations.
 *
 * Safe because katexMacros are a static config object — they never change
 * between renders in the same dev-server session.
 */

import katex from 'katex';

const cache = new Map();
const _orig = katex.renderToString.bind(katex);

katex.renderToString = (expression, options) => {
  const key = `${options?.displayMode ? 1 : 0}:${options?.output ?? ''}:${expression}`;
  if (cache.has(key)) return cache.get(key);
  const html = _orig(expression, options);
  cache.set(key, html);
  return html;
};
