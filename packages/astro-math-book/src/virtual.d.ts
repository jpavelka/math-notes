declare module 'virtual:astro-math-book/katex-macros' {
  export const katexMacros: Record<string, string>;
}

declare module 'virtual:astro-math-book/registry' {
  import type { Registry } from './lib/registry';
  const registry: Registry;
  export default registry;
}

declare module 'virtual:astro-math-book/bibliography' {
  import type { Bibliography } from './lib/bibliography';
  const bibliography: Bibliography;
  export default bibliography;
}
