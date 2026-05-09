import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function PrintFallback({ children }: Props) {
  return <div className="print-fallback">{children}</div>;
}
