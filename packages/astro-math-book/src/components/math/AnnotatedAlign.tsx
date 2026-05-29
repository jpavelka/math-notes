import React from 'react';
import katex from 'katex';
import { katexMacros } from 'virtual:astro-math-book/katex-macros';
import { renderAnnotationText } from './renderInlineMath';

export interface AlignRow {
  math: string;              // row content; use & as alignment separator (same as LaTeX align*)
  annotation?: string | React.ReactNode; // optional annotation; supports $...$ inline math, [ref:id] cross-references, or any JSX
  body?: boolean;            // set true when annotation content comes from an <AnnotationBody row={i}> child
  id?: string;               // optional HTML anchor id for cross-referencing
  number?: string | number;  // injected automatically by the remark plugin; can be overridden
  label?: string;            // custom label shown instead of number (e.g. "★")
}

function renderSeg(src: string, continuation = false): string {
  if (!src.trim()) return '';
  // Prepend {} on continuation segments so KaTeX sees a preceding atom and
  // applies the correct inter-atom spacing (e.g. \thickmuskip around =).
  const math = continuation ? `{}${src}` : src;
  return katex.renderToString(`\\displaystyle{${math}}`, {
    displayMode: false,
    throwOnError: false,
    macros: katexMacros,
  });
}

// Runs inline after the block renders; no React hydration needed.
const toggleScript = `(function(){
  var b=document.currentScript.previousElementSibling;
  b.querySelectorAll('[data-annot-toggle]').forEach(function(btn){
    var panel=b.querySelector('[data-annot-annotation="'+btn.dataset.annotToggle+'"]');
    btn.addEventListener('click',function(){
      var wasOpen=btn.classList.contains('annot-align-btn--open');
      b.querySelectorAll('[data-annot-annotation]').forEach(function(r){r.style.display='none';});
      b.querySelectorAll('[data-annot-toggle]').forEach(function(t){
        t.classList.remove('annot-align-btn--open');
        t.setAttribute('aria-label','Show annotation');
      });
      if(!wasOpen&&panel){
        panel.style.display='';
        btn.classList.add('annot-align-btn--open');
        btn.setAttribute('aria-label','Hide annotation');
      }
    });
  });
  b.querySelectorAll('.annot-align-annotation .ref').forEach(function(ref){
    ref.addEventListener('mouseenter',function(){ b.classList.add('has-open-ref-tooltip'); });
    ref.addEventListener('mouseleave',function(){ b.classList.remove('has-open-ref-tooltip'); });
  });
})();`;

export function AnnotatedAlign({ id, rows = [], children }: { id?: string; rows?: AlignRow[]; children?: React.ReactNode }) {
  const maxCols = rows.reduce((m, r) => Math.max(m, r.math.split('&').length), 1);
  const hasAnnotations = rows.some(r => r.annotation || r.body);
  const hasNumbers = rows.some(r => r.number != null || r.label != null);

  // Layout: [1fr] [math cols…] [toggle?] [1fr] [number?]
  // The two 1fr spacers center the math content; number is pinned at the right edge.
  const toggleColIdx = maxCols + 2;
  const numberColIdx = maxCols + (hasAnnotations ? 1 : 0) + 3;

  const colTemplate = [
    '1fr',
    ...Array.from({ length: maxCols }, () => 'max-content'),
    ...(hasAnnotations ? ['1.5rem'] : []),
    '1fr',
    ...(hasNumbers ? ['3.5rem'] : []),
  ].join(' ');

  return (
    <>
      <div className="annot-align-block" {...(id ? { id } : {})}>
        <div
          className="annot-align-grid"
          style={{
            gridTemplateColumns: colTemplate,
            '--annot-num-w': hasNumbers ? '3.5rem' : '0px',
          } as React.CSSProperties}
        >
          {rows.map((row, ri) => {
            const segs = row.math.split('&');
            const mathRow  = ri * 2 + 1;
            const annotRow = ri * 2 + 2;

            return (
              <React.Fragment key={ri}>
                {Array.from({ length: maxCols }, (_, ci) => (
                  <span
                    key={ci}
                    className={`annot-align-cell ${ci % 2 === 0 ? 'annot-align-cell--r' : 'annot-align-cell--l'}${ci > 0 && ci % 2 === 0 ? ' annot-align-cell--pair-r' : ''}`}
                    style={{ gridRow: mathRow, gridColumn: ci + 2 }}
                  >
                    {ci === 0 && row.id && (
                      <span id={row.id} className="subeq-anchor" />
                    )}
                    <span dangerouslySetInnerHTML={{ __html: renderSeg(segs[ci]?.trim() ?? '', ci > 0) }} />
                  </span>
                ))}

                {hasAnnotations && (
                  <span
                    className="annot-align-toggle-cell"
                    style={{ gridRow: mathRow, gridColumn: toggleColIdx }}
                  >
                    {(row.annotation || row.body) && (
                      <button
                        className="annot-align-btn"
                        data-annot-toggle={ri}
                        type="button"
                        aria-label="Show annotation"
                      >
                        ?
                      </button>
                    )}
                  </span>
                )}

                {hasNumbers && (
                  <span
                    className="annot-align-num"
                    style={{ gridRow: mathRow, gridColumn: numberColIdx }}
                  >
                    {(row.label ?? row.number) != null
                      ? `(${row.label ?? row.number})`
                      : ''}
                  </span>
                )}

                {hasAnnotations && (row.annotation != null || row.body) && (
                  row.annotation != null ? (
                    typeof row.annotation === 'string' ? (
                      <span
                        className="annot-align-annotation"
                        data-annot-annotation={ri}
                        style={{ display: 'none', gridRow: annotRow, gridColumn: '1 / -1' }}
                        dangerouslySetInnerHTML={{ __html: renderAnnotationText(row.annotation) }}
                      />
                    ) : (
                      <span
                        className="annot-align-annotation"
                        data-annot-annotation={ri}
                        style={{ display: 'none', gridRow: annotRow, gridColumn: '1 / -1' }}
                      >
                        {row.annotation}
                      </span>
                    )
                  ) : (
                    <span
                      className="annot-align-annotation"
                      data-annot-annotation={ri}
                      style={{ display: 'none', gridRow: annotRow, gridColumn: '1 / -1' }}
                    />
                  )
                )}
              </React.Fragment>
            );
          })}
        </div>
        {children}
      </div>
      {hasAnnotations && (
        <script dangerouslySetInnerHTML={{ __html: toggleScript }} />
      )}
    </>
  );
}
