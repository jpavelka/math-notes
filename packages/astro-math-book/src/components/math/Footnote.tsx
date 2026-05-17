import React from 'react';

export function Footnote({ number, id: _id }: { number?: number; id?: string }) {
  const n = number ?? 0;
  const id = `fn-ref-${n}`;
  return (
    <span className="ref" id={id}>
      <button className="ref-link footnote-marker" type="button">
        <sup>[{n || '?'}]</sup>
      </button>
      {/* Populated at runtime by the nearest FootnoteBody's inline script */}
      <span className="ref-tooltip footnote-tooltip" data-fn-tooltip={String(n)} />
    </span>
  );
}
