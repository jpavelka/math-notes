import React from 'react';

const populateScript = `(function(){
  var body = document.currentScript.previousElementSibling;
  var n = body.dataset.fnBody;
  var tip = document.querySelector('[data-fn-tooltip="'+n+'"]');
  if (!tip) return;
  tip.innerHTML = body.innerHTML;
  var sup = document.createElement('sup');
  sup.className = 'footnote-marker';
  sup.textContent = '['+n+']';
  var target = tip.firstElementChild || tip;
  target.prepend(sup, ' ');
})();`;

export function FootnoteBody({ children, number }: { children?: React.ReactNode; number?: number }) {
  const n = number ?? 0;
  return (
    <>
      <div className="footnote-body" data-fn-body={String(n)} aria-hidden="true" hidden>
        {children}
      </div>
      <script dangerouslySetInnerHTML={{ __html: populateScript }} />
    </>
  );
}
