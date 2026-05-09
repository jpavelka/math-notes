import React from 'react';
import katex from 'katex';
import { katexMacros } from 'virtual:astro-math-book/katex-macros';
import { renderReasonText } from './renderInlineMath';

export interface AlignRow {
  math: string;              // row content; use & as alignment separator (same as LaTeX align*)
  reason?: string;           // optional annotation; supports $...$ inline math
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
    var reason=b.querySelector('[data-annot-reason="'+btn.dataset.annotToggle+'"]');
    btn.addEventListener('click',function(){
      var wasOpen=btn.classList.contains('annot-align-btn--open');
      b.querySelectorAll('[data-annot-reason]').forEach(function(r){r.style.display='none';});
      b.querySelectorAll('[data-annot-toggle]').forEach(function(t){
        t.classList.remove('annot-align-btn--open');
        t.setAttribute('aria-label','Show reasoning');
      });
      if(!wasOpen&&reason){
        reason.style.display='';
        btn.classList.add('annot-align-btn--open');
        btn.setAttribute('aria-label','Hide reasoning');
      }
    });
  });
  b.querySelectorAll('.annot-align-reason .ref').forEach(function(ref){
    ref.addEventListener('mouseenter',function(){ b.classList.add('has-open-ref-tooltip'); });
    ref.addEventListener('mouseleave',function(){ b.classList.remove('has-open-ref-tooltip'); });
  });
})();`;

export function AnnotatedAlign({ rows = [], children }: { rows?: AlignRow[]; children?: React.ReactNode }) {
  const maxCols = rows.reduce((m, r) => Math.max(m, r.math.split('&').length), 1);
  const hasReasons = rows.some(r => r.reason || r.body);
  const hasNumbers = rows.some(r => r.number != null || r.label != null);

  const toggleColIdx = maxCols + 1;
  const numberColIdx = maxCols + (hasReasons ? 1 : 0) + 1;
  const totalCols    = maxCols + (hasReasons ? 1 : 0) + (hasNumbers ? 1 : 0);

  const colTemplate = [
    ...Array.from({ length: maxCols }, () => 'max-content'),
    ...(hasReasons ? ['1.5rem'] : []),
    ...(hasNumbers ? ['3.5rem'] : []),
  ].join(' ');

  return (
    <>
      <div className="annot-align-block">
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
                    className={`annot-align-cell ${ci % 2 === 0 ? 'annot-align-cell--r' : 'annot-align-cell--l'}`}
                    style={{ gridRow: mathRow, gridColumn: ci + 1 }}
                  >
                    {ci === 0 && row.id && (
                      <span id={row.id} className="subeq-anchor" />
                    )}
                    <span dangerouslySetInnerHTML={{ __html: renderSeg(segs[ci]?.trim() ?? '', ci > 0) }} />
                  </span>
                ))}

                {hasReasons && (
                  <span
                    className="annot-align-toggle-cell"
                    style={{ gridRow: mathRow, gridColumn: toggleColIdx }}
                  >
                    {(row.reason || row.body) && (
                      <button
                        className="annot-align-btn"
                        data-annot-toggle={ri}
                        type="button"
                        aria-label="Show reasoning"
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

                {hasReasons && (row.reason || row.body) && (
                  row.reason ? (
                    <span
                      className="annot-align-reason"
                      data-annot-reason={ri}
                      style={{ display: 'none', gridRow: annotRow, gridColumn: '1 / -1' }}
                      dangerouslySetInnerHTML={{ __html: renderReasonText(row.reason) }}
                    />
                  ) : (
                    <span
                      className="annot-align-reason"
                      data-annot-reason={ri}
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
      {hasReasons && (
        <script dangerouslySetInnerHTML={{ __html: toggleScript }} />
      )}
    </>
  );
}
