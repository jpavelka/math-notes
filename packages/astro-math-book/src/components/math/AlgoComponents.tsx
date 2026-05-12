import type { ReactNode } from 'react';
import { renderInlineMath } from './renderInlineMath';

// ── Internal primitives ───────────────────────────────────────────────────────

function Line({ children }: { children: ReactNode }) {
  return (
    <div className="algo-line">
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

function CondSpan({ src }: { src: string }) {
  return <span dangerouslySetInnerHTML={{ __html: renderInlineMath(src) }} />;
}

// ── Public components ─────────────────────────────────────────────────────────

export function AlgoStep({ children }: { children: ReactNode }) {
  return <Line>{children}</Line>;
}

export function AlgoReturn({ children }: { children: ReactNode }) {
  return <Line><Kw>return</Kw> {children}</Line>;
}

export function AlgoFor({ each, children }: { each: string; children?: ReactNode }) {
  return (
    <>
      <Line><Kw>for</Kw> <CondSpan src={each} /> <Kw>do</Kw></Line>
      {children && <Block>{children}</Block>}
    </>
  );
}

export function AlgoWhile({ cond, children }: { cond: string; children?: ReactNode }) {
  return (
    <>
      <Line><Kw>while</Kw> <CondSpan src={cond} /> <Kw>do</Kw></Line>
      {children && <Block>{children}</Block>}
    </>
  );
}

export function AlgoIf({ cond, children }: { cond: string; children?: ReactNode }) {
  return (
    <>
      <Line><Kw>if</Kw> <CondSpan src={cond} /> <Kw>then</Kw></Line>
      {children && <Block>{children}</Block>}
    </>
  );
}

export function AlgoElseIf({ cond, children }: { cond: string; children?: ReactNode }) {
  return (
    <>
      <Line><Kw>else if</Kw> <CondSpan src={cond} /> <Kw>then</Kw></Line>
      {children && <Block>{children}</Block>}
    </>
  );
}

export function AlgoElse({ children }: { children?: ReactNode }) {
  return (
    <>
      <Line><Kw>else</Kw></Line>
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
