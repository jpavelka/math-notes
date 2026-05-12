import type { ReactNode } from 'react';

interface BlockQuoteProps {
  attribution?: string;
  children: ReactNode;
}

export function BlockQuote({ attribution, children }: BlockQuoteProps) {
  return (
    <blockquote className="block-quote">
      <div className="block-quote-body">{children}</div>
      {attribution && (
        <footer className="block-quote-attribution">
          <span dangerouslySetInnerHTML={{ __html: `— ${attribution}` }} />
        </footer>
      )}
    </blockquote>
  );
}
