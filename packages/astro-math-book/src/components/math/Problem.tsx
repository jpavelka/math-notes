import type { ReactNode } from 'react';

export interface ProblemProps {
  id?: string;
  title: string;
  label?: string;
  number?: number | string;
  children: ReactNode;
}

export function ProblemInstance({ children }: { children?: ReactNode }) {
  return (
    <div className="math-problem-section">
      <span className="math-problem-section-label">Instance: </span>
      {children}
    </div>
  );
}

export function ProblemQuestion({ children }: { children?: ReactNode }) {
  return (
    <div className="math-problem-section">
      <span className="math-problem-section-label">Problem: </span>
      {children}
    </div>
  );
}

export function ProblemVariants({ children }: { children?: ReactNode }) {
  return (
    <div className="math-problem-section">
      <span className="math-problem-section-label">Variants: </span>
      {children}
    </div>
  );
}

export function ProblemInEnglish({ children }: { children?: ReactNode }) {
  return (
    <div className="math-problem-section">
      <span className="math-problem-section-label">In English: </span>
      {children}
    </div>
  );
}

export function Problem({ id, title, label, number, children }: ProblemProps) {
  return (
    <div
      className="math-problem"
      id={id}
      {...(id ? { 'data-pagefind-filter': 'type:Problem' } : {})}
    >
      <div className="math-problem-header">
        Problem {number}: {title}
        {label && <> ({label})</>}
      </div>
      <div className="math-problem-body">
        {children}
      </div>
    </div>
  );
}
