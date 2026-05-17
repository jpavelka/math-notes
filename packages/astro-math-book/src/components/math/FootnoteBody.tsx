import React from 'react';

const populateScript = `(function(){
  var body = document.currentScript.previousElementSibling;
  var n = body.dataset.fnBody;
  var tip = document.querySelector('[data-fn-tooltip="'+n+'"]');
  if (!tip) return;
  tip.innerHTML = body.innerHTML;
  tip.insertAdjacentHTML('afterbegin', '<button class="ref-pin-btn" aria-label="Pin tooltip"><svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5h-4v4.5c0 .276-.224 1.5-.5 1.5s-.5-1.224-.5-1.5V10h-4a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A5.921 5.921 0 0 1 5 6.708V2.277a2.77 2.77 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354z"/><\/svg><\/button>');
  var sup = document.createElement('sup');
  sup.className = 'footnote-marker';
  sup.textContent = '['+n+']';
  var firstEl = tip.firstElementChild;
  var BLOCK = new Set(['P','DIV','BLOCKQUOTE','UL','OL','PRE','H1','H2','H3','H4','H5','H6','FIGURE','SECTION']);
  var target = (firstEl && BLOCK.has(firstEl.tagName)) ? firstEl : tip;
  target.prepend(sup, ' ');
})();`;

export function FootnoteBody({ children, number, id: _id }: { children?: React.ReactNode; number?: number; id?: string }) {
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
