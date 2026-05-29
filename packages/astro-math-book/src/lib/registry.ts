export interface RegistryEntry {
  id: string;
  type: string;
  /**
   * Rendering hint consumed by <Ref>:
   *   'float'    — Figure/Table/Algorithm-like (caption label, no env styling)
   *   'equation' — numbered equation
   *   'section'  — heading anchor
   *   absent     — theorem-like env (bold label, env-styled tooltip)
   */
  kind?: 'float' | 'equation' | 'section' | 'symbol';
  /** For symbol entries: the raw LaTeX source, e.g. "\\mathbb{R}" */
  latex?: string;
  /** For symbol entries: extra search terms configured in symbols.ts */
  aliases?: string[];
  /** chapter.localCount format, e.g. "2.3" */
  number: string;
  /** optional display label overriding the number, e.g. "★" or "FTC" */
  label?: string;
  title?: string;
  /** For float entries: pre-rendered caption HTML (may contain inline KaTeX). Used in cross-chapter tooltips when the caption is a JSX expression that can't be stored as a plain string. */
  captionHTML?: string;
  /** Alternate terms for this entry (used for search and glossary "See …" entries) */
  alt?: string[];
  /** Pre-computed copy-paste text of the rendered LaTeX (for search). Symbols only. */
  copyText?: string;
  chapter: number | string;
  contentHTML: string;
  href: string;
  proofHref?: string;
}

export type Registry = Record<string, RegistryEntry>;
