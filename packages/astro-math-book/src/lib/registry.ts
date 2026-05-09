export interface RegistryEntry {
  id: string;
  type: string;
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
