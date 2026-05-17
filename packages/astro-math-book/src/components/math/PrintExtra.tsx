import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function PrintExtra({ children }: Props) {
  return <div className="print-extra">{children}</div>;
}
