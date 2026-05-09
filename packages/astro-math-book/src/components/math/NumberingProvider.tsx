import { createContext, useContext, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';

type Ctx = { getNumber: (type: string) => number };

const NumberingContext = createContext<Ctx | null>(null);

/**
 * React context provider for manual numbering outside MDX.
 * In MDX pages, numbering is handled at compile time by remark-number-envs.
 */
export function NumberingProvider({ children }: { children?: ReactNode }) {
  const counters = useRef<Record<string, number>>({});
  const getNumber = useCallback((type: string) => {
    counters.current[type] = (counters.current[type] ?? 0) + 1;
    return counters.current[type];
  }, []);
  return (
    <NumberingContext.Provider value={{ getNumber }}>
      {children}
    </NumberingContext.Provider>
  );
}

export function useNumberingContext() {
  return useContext(NumberingContext);
}
