import { useState, useId, useEffect } from 'react';

const WIDTH = 500;
const HEIGHT = 320;
const NODE_RADIUS = 30;
const LABEL_FONT = 18;
const PAD = NODE_RADIUS + 4;
const CURVE = 28;

const BLUE = '#2563eb';
const BLUE_FILL = '#dbeafe';
const GRAY = '#9ca3af';

const NODES = [
  { id: '1', x: 0.2, y: 1 },
  { id: '2', x: 0.8, y: 1 },
  { id: '3', x: 0,   y: 0 },
  { id: '4', x: 1,   y: 0 },
  { id: '5', x: 0.5, y: 0.5 },
];

const MST: [string, string][] = [
  ['1', '2'],
  ['2', '4'],
  ['2', '5'],
  ['3', '5'],
];

const STEPS = [
  { from: '1', to: '2', backtrack: false },
  { from: '2', to: '5', backtrack: false },
  { from: '5', to: '3', backtrack: false },
  { from: '3', to: '5', backtrack: true  },
  { from: '5', to: '2', backtrack: true  },
  { from: '2', to: '4', backtrack: false },
  { from: '4', to: '2', backtrack: true  },
  { from: '2', to: '1', backtrack: true  },
];

function svgPos(x: number, y: number) {
  return {
    x: PAD + x * (WIDTH - 2 * PAD),
    y: (HEIGHT - PAD) - y * (HEIGHT - 2 * PAD),
  };
}

function edgeVecs(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;
  return {
    x1: from.x + ux * NODE_RADIUS,
    y1: from.y + uy * NODE_RADIUS,
    x2: to.x  - ux * NODE_RADIUS,
    y2: to.y  - uy * NODE_RADIUS,
    px: -uy, py: ux,
    mx: (from.x + to.x) / 2,
    my: (from.y + to.y) / 2,
  };
}

export function TraversalAlgo() {
  const [step, setStep] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('print').matches ? STEPS.length : 0
  );
  useEffect(() => {
    const handler = () => setStep(STEPS.length);
    window.addEventListener('beforeprint', handler);
    return () => window.removeEventListener('beforeprint', handler);
  }, []);
  const uid = useId().replace(/:/g, '');
  const fwdId = `tsp-trav-fwd-${uid}`;
  const bckId = `tsp-trav-bck-${uid}`;

  const pos = new Map(NODES.map(n => [n.id, svgPos(n.x, n.y)]));
  const visible = STEPS.slice(0, step);
  const visSet = new Set(visible.map(s => `${s.from}->${s.to}`));

  // Node 1 is visited from the start; others join on their first appearance as `to`
  const visited = new Set<string>(['1']);
  for (const s of visible) visited.add(s.to);

  // MST edges with no traversal arrows yet → show as undirected base
  const touchedKeys = new Set(visible.map(s => [s.from, s.to].sort().join(',')));
  const undirectedBase = MST.filter(([u, v]) => !touchedKeys.has([u, v].sort().join(',')));

  // Traversal path string
  const pathNodes = step === 0 ? ['1'] : ['1', ...visible.map(s => s.to)];
  const pathStr = pathNodes.join(' → ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <svg
        width={WIDTH} height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
      >
        <defs>
          <marker id={fwdId} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={BLUE} />
          </marker>
          <marker id={bckId} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={GRAY} />
          </marker>
        </defs>

        {/* Undirected MST base for edges not yet traversed */}
        {undirectedBase.map(([u, v]) => {
          const su = pos.get(u)!, sv = pos.get(v)!;
          const g = edgeVecs(su, sv);
          return (
            <line key={`base-${u}-${v}`}
              x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
              stroke="currentColor" strokeWidth={1.5}
            />
          );
        })}

        {/* Directed traversal arrows, accumulated */}
        {visible.map((s, i) => {
          const hasBoth = visSet.has(`${s.from}->${s.to}`) && visSet.has(`${s.to}->${s.from}`);
          const sp = pos.get(s.from)!, tp = pos.get(s.to)!;
          const g = edgeVecs(sp, tp);
          const color = s.backtrack ? GRAY : BLUE;
          const marker = `url(#${s.backtrack ? bckId : fwdId})`;

          if (hasBoth) {
            const cpx = g.mx + g.px * CURVE;
            const cpy = g.my + g.py * CURVE;
            return (
              <path key={`step-${i}`}
                d={`M ${g.x1} ${g.y1} Q ${cpx} ${cpy} ${g.x2} ${g.y2}`}
                fill="none" stroke={color} strokeWidth={2.5}
                markerEnd={marker}
              />
            );
          }
          return (
            <line key={`step-${i}`}
              x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
              stroke={color} strokeWidth={2.5}
              markerEnd={marker}
            />
          );
        })}

        {/* Nodes */}
        {NODES.map(node => {
          const p = pos.get(node.id)!;
          const isVisited = visited.has(node.id);
          return (
            <g key={node.id}>
              <circle cx={p.x} cy={p.y} r={NODE_RADIUS}
                fill={isVisited ? BLUE_FILL : 'var(--bg)'}
                stroke={isVisited ? BLUE : 'currentColor'}
                strokeWidth={2}
              />
              <text x={p.x} y={p.y}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={LABEL_FONT}
                fill={isVisited ? BLUE : 'currentColor'}
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {node.id}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Current traversal path */}
      <div style={{
        fontFamily: 'monospace',
        fontSize: '1em',
        color: 'currentColor',
        minHeight: '1.5em',
        letterSpacing: '0.02em',
      }}>
        {pathStr}
      </div>

      {/* Navigation */}
      <div className="no-print" style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>← Prev</button>
        <button onClick={() => setStep(s => Math.min(STEPS.length, s + 1))} disabled={step === STEPS.length}>Next →</button>
      </div>
    </div>
  );
}
