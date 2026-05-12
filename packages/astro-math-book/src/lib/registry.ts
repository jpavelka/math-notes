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
  kind?: 'float' | 'equation' | 'section';
  /** chapter.localCount format, e.g. "2.3" */
  number: string;
  /** optional display label overriding the number, e.g. "★" or "FTC" */
  label?: string;
  title?: string;
  chapter: number | string;
  contentHTML: string;
  href: string;
  proofHref?: string;
}

export type Registry = Record<string, RegistryEntry>;
