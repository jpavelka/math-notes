import type { ReactNode } from 'react';
import { renderInlineMath } from './renderInlineMath';
import { fromAstroJSX, processLatexInNode } from './createFloatEnv';

// ── Internal primitives ───────────────────────────────────────────────────────

function Line({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div className="algo-line" id={id}>
      <span className="algo-num" />
      <span className="algo-body">{children}</span>
    </div>
  );
}

function Block({ children }: { children: ReactNode }) {
  return <div className="algo-block">{children}</div>;
}

function Kw({ children }: { children: ReactNode }) {
  return <span className="algo-kw">{children}</span>;
}

function renderCond(cond: ReactNode): ReactNode {
  if (typeof cond === 'string') {
    return <span dangerouslySetInnerHTML={{ __html: renderInlineMath(cond) }} />;
  }
  return processLatexInNode(fromAstroJSX(cond));
}

// ── Public components ─────────────────────────────────────────────────────────

export function AlgoStep({ id, children }: { id?: string; children: ReactNode }) {
  return <Line id={id}>{children}</Line>;
}

export function AlgoReturn({ id, children }: { id?: string; children: ReactNode }) {
  return <Line id={id}><Kw>return</Kw> {children}</Line>;
}

export function AlgoFor({ each, note, id, children }: { each: ReactNode; note?: ReactNode; id?: string; children?: ReactNode }) {
  return (
    <>
      <Line id={id}><Kw>for</Kw> {renderCond(each)}{fromAstroJSX(note)} <Kw>do</Kw></Line>
      {children && <Block>{children}</Block>}
    </>
  );
}

export function AlgoWhile({ cond, note, id, children }: { cond: ReactNode; note?: ReactNode; id?: string; children?: ReactNode }) {
  return (
    <>
      <Line id={id}><Kw>while</Kw> {renderCond(cond)}{fromAstroJSX(note)} <Kw>do</Kw></Line>
      {children && <Block>{children}</Block>}
    </>
  );
}

export function AlgoIf({ cond, note, id, children }: { cond: ReactNode; note?: ReactNode; id?: string; children?: ReactNode }) {
  return (
    <>
      <Line id={id}><Kw>if</Kw> {renderCond(cond)}{fromAstroJSX(note)} <Kw>then</Kw></Line>
      {children && <Block>{children}</Block>}
    </>
  );
}

export function AlgoElseIf({ cond, note, id, children }: { cond: ReactNode; note?: ReactNode; id?: string; children?: ReactNode }) {
  return (
    <>
      <Line id={id}><Kw>else if</Kw> {renderCond(cond)}{fromAstroJSX(note)} <Kw>then</Kw></Line>
      {children && <Block>{children}</Block>}
    </>
  );
}

export function AlgoElse({ id, children }: { id?: string; children?: ReactNode }) {
  return (
    <>
      <Line id={id}><Kw>else</Kw></Line>
      {children && <Block>{children}</Block>}
    </>
  );
}

export function AlgoComment({ children }: { children: ReactNode }) {
  return (
    <div className="algo-line algo-comment">
      <span className="algo-num" aria-hidden="true" />
      <span className="algo-body">
        <span className="algo-comment-marker" aria-hidden="true">▷</span> {children}
      </span>
    </div>
  );
}

export function AlgoInput({ children }: { children: ReactNode }) {
  return (
    <div className="algo-meta">
      <span className="algo-meta-label">Input:</span> {children}
    </div>
  );
}

export function AlgoOutput({ children }: { children: ReactNode }) {
  return (
    <div className="algo-meta">
      <span className="algo-meta-label">Output:</span> {children}
    </div>
  );
}
