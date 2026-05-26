import React from 'react';

const populateScript = `(function(){
  var body=document.currentScript.previousElementSibling;
  var row=body.dataset.annotBody;
  var block=body.closest('.annot-align-block');
  var panel=block&&block.querySelector('[data-annot-annotation="'+row+'"]');
  if(panel) panel.innerHTML=body.innerHTML;
})();`;

export function AnnotationBody({ children, row }: { children?: React.ReactNode; row: number }) {
  return (
    <>
      <div
        className="annot-align-body-src"
        data-annot-body={String(row)}
        data-pagefind-ignore
        hidden
        aria-hidden="true"
      >
        {children}
      </div>
      <script dangerouslySetInnerHTML={{ __html: populateScript }} />
    </>
  );
}
