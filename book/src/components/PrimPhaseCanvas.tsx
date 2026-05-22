import { useId } from 'react';
import {
  type Node, type UEdge, type EdgeGeom, type Phase,
  edgeKey, labelPos, labelSize,
} from './primAlgoUtils';

interface Props {
  nodes: Node[];
  posMap: Map<string, { x: number; y: number }>;
  edgeGeom: EdgeGeom[];
  U: Set<string>;
  T: Set<string>;
  phase: Phase;
  wrongEdge: { edgeId: string; animKey: number } | null;
  toast: { msg: string; key: number } | null;
  onEdgeClick: (edge: UEdge) => void;
  width: number;
  height: number;
  nodeRadius: number;
  labelFontSize: number;
  edgeWeightFontSize: number;
}

export function PrimPhaseCanvas({
  nodes, posMap, edgeGeom,
  U, T, phase,
  wrongEdge, toast, onEdgeClick,
  width, height, nodeRadius,
  labelFontSize, edgeWeightFontSize,
}: Props) {
  const uid = useId().replace(/:/g, '');
  const glowId = `prim-glow-${uid}`;

  function edgeVisual(edge: UEdge) {
    const k = edgeKey(edge.u, edge.v);
    const inT = T.has(k);
    const isWrong = wrongEdge?.edgeId === k;
    if (isWrong) return { stroke: '#dc2626', sw: 3.5, opacity: 1, clickable: true };
    if (phase === 'done') {
      return inT
        ? { stroke: '#16a34a', sw: 3.5, opacity: 1, clickable: false }
        : { stroke: 'currentColor', sw: 1.5, opacity: 1, clickable: false };
    }
    if (inT) return { stroke: '#2563eb', sw: 3.5, opacity: 1, clickable: false };
    return { stroke: 'currentColor', sw: 1.5, opacity: 1, clickable: true };
  }

  function nodeVisual(id: string) {
    if (phase === 'done')
      return { fill: '#bbf7d0', stroke: '#16a34a', text: '#16a34a', sw: 2.5 };
    if (U.has(id))
      return { fill: '#dbeafe', stroke: '#2563eb', text: '#1e3a8a', sw: 2 };
    return { fill: 'var(--bg)', stroke: 'currentColor', text: 'currentColor', sw: 1.5 };
  }

  const sortedGeom = [...edgeGeom].sort((a, b) => {
    const rank = (e: UEdge) => T.has(edgeKey(e.u, e.v)) ? 2 : ((U.has(e.u) !== U.has(e.v)) ? 1 : 0);
    return rank(a.edge) - rank(b.edge);
  });

  return (
    <div style={{ position: 'relative' }}>
      <style>{`
        @keyframes prim-toast { 0%,70% { opacity:1 } 100% { opacity:0 } }
        @keyframes prim-shake {
          0%,100% { transform:translateX(0) }
          20%     { transform:translateX(-5px) }
          40%     { transform:translateX(5px) }
          60%     { transform:translateX(-5px) }
          80%     { transform:translateX(5px) }
        }
        .prim-shake { animation: prim-shake 0.4s ease; }
      `}</style>

      <svg
        width={width} height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block', maxWidth: '100%', height: 'auto', color: 'var(--text)' }}
      >
        <defs>
          <filter id={glowId} x={-12} y={-12} width={width + 24} height={height + 24} filterUnits="userSpaceOnUse">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {sortedGeom.map((g) => {
          const { x1, y1, x2, y2, mx, my, px, py, curveOffset, edge } = g;
          const cpx = mx + px * curveOffset;
          const cpy = my + py * curveOffset;
          const curved = curveOffset !== 0;
          const k = edgeKey(edge.u, edge.v);
          const vis = edgeVisual(edge);
          const isWrong = wrongEdge?.edgeId === k;
          const inT = T.has(k);
          const pathD = curved ? `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}` : undefined;

          return (
            <g
              key={isWrong ? `wrong-${wrongEdge!.animKey}-${k}` : k}
              onClick={() => onEdgeClick(edge)}
              style={{ cursor: vis.clickable ? 'pointer' : 'default', opacity: vis.opacity }}
              className={isWrong ? 'prim-shake' : undefined}
              filter={inT && phase === 'done' ? `url(#${glowId})` : undefined}
            >
              {curved
                ? <path d={pathD} fill="none" stroke="transparent" strokeWidth={14} />
                : <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14} />}
              {curved
                ? <path d={pathD} fill="none" stroke={vis.stroke} strokeWidth={vis.sw} />
                : <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={vis.stroke} strokeWidth={vis.sw} />}
            </g>
          );
        })}

        {nodes.map(node => {
          const pos = posMap.get(node.id)!;
          const vis = nodeVisual(node.id);
          return (
            <g key={node.id}>
              <circle cx={pos.x} cy={pos.y} r={nodeRadius}
                fill={vis.fill} stroke={vis.stroke} strokeWidth={vis.sw} />
              <text x={pos.x} y={pos.y}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={labelFontSize} fill={vis.text}
                style={{ userSelect: 'none', pointerEvents: 'none' }}>
                {node.id}
              </text>
            </g>
          );
        })}

        {sortedGeom.map((g) => {
          const { edge } = g;
          const { lx, ly } = labelPos(g);
          const { w: lw, h: lh } = labelSize(edge.weight, edgeWeightFontSize);
          const k = edgeKey(edge.u, edge.v);
          const vis = edgeVisual(edge);
          return (
            <g key={`label-${k}`} style={{ pointerEvents: 'none' }}>
              <rect x={lx - lw / 2} y={ly - lh / 2} width={lw} height={lh} fill="var(--bg)" />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                fontSize={edgeWeightFontSize} fill={vis.stroke}
                style={{ userSelect: 'none' }}>
                {edge.weight}
              </text>
            </g>
          );
        })}
      </svg>

      {toast && (
        <div key={toast.key} style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(15,15,15,0.82)', color: '#fff',
          padding: '8px 18px', borderRadius: '6px',
          fontSize: '0.85em', maxWidth: '80%', textAlign: 'center',
          pointerEvents: 'none',
          animation: 'prim-toast 2.8s ease forwards',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
