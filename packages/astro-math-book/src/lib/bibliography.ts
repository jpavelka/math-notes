export interface BibEntry {
  key: string;
  type: string;
  /** Inline citation label, e.g. "Smith & Jones, 2021" */
  label: string;
  /** For sorting entries in the bibliography */
  sortKey: string;
  /** Formatted HTML string for the bibliography list */
  formatted: string;
  /** Optional cover image URL or project-relative path */
  image?: string;
}

export type Bibliography = Record<string, BibEntry>;
