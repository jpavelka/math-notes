// Re-export all math components from the astro-math-book package.
// This shim allows MDX files to import from '@/components/math' or
// via relative paths ('../../components/math') without knowing the
// package internals. Site-specific overrides can also be added here.
export * from 'astro-math-book/components';
