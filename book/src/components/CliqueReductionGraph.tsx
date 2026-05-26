import React, { useState } from 'react';

// φ = (x₁∨x₂∨x₃) ∧ (¬x₁∨¬x₂∨x₃) ∧ (¬x₁∨x₂∨¬x₃)
// Vertex label format: [clause][x][variable], e.g. "1x2" = clause 1, literal x₂
const NODES = [
  { id: '2x1', x: 0.22, y: 1.00 },
  { id: '2x2', x: 0.47, y: 1.00 },
  { id: '2x3', x: 0.74, y: 1.00 },
  { id: '1x1', x: 0.00, y: 0.58 },
  { id: '1x2', x: 0.16, y: 0.27 },
  { id: '1x3', x: 0.26, y: 0.00 },
  { id: '3x1', x: 1.00, y: 0.58 },
  { id: '3x2', x: 0.83, y: 0.27 },
  { id: '3x3', x: 0.70, y: 0.00 },
];

// Cross-clause edges: omit pairs sharing the same variable with contradicting signs.
// Omitted: (1x1,2x1), (1x2,2x2), (1x1,3x1), (1x3,3x3), (2x2,3x2), (2x3,3x3)
const EDGES = [
  // Clause 1 ↔ Clause 2
  { from: '1x1', to: '2x2' },
  { from: '1x1', to: '2x3' },
  { from: '1x2', to: '2x1' },
  { from: '1x2', to: '2x3' },
  { from: '1x3', to: '2x1' },
  { from: '1x3', to: '2x2' },
  { from: '1x3', to: '2x3' },
  // Clause 1 ↔ Clause 3
  { from: '1x1', to: '3x2' },
  { from: '1x1', to: '3x3' },
  { from: '1x2', to: '3x1' },
  { from: '1x2', to: '3x2' },
  { from: '1x2', to: '3x3' },
  { from: '1x3', to: '3x1' },
  { from: '1x3', to: '3x2' },
  // Clause 2 ↔ Clause 3
  { from: '2x1', to: '3x1' },
  { from: '2x1', to: '3x2' },
  { from: '2x1', to: '3x3' },
  { from: '2x2', to: '3x1' },
  { from: '2x2', to: '3x3' },
  { from: '2x3', to: '3x1' },
  { from: '2x3', to: '3x2' },
];

const WIDTH = 480;
const HEIGHT = 336;
const NODE_RADIUS = 24;
const PAD = NODE_RADIUS + 4;

function toSvg(x: number, y: number) {
  return {
    x: PAD + x * (WIDTH - 2 * PAD),
    y: (HEIGHT - PAD) - y * (HEIGHT - 2 * PAD),
  };
}

export function CliqueReductionGraph() {
  const [selected, setSelected] = useState<string | null>(null);

  const pos = new Map(NODES.map(n => [n.id, toSvg(n.x, n.y)]));

  const adj = new Map<string, Set<string>>(NODES.map(n => [n.id, new Set<string>()]));
  for (const e of EDGES) {
    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from);
  }

  const isNodeActive = (id: string) =>
    selected === null || selected === id || (adj.get(selected)?.has(id) ?? false);

  const isEdgeActive = (from: string, to: string) =>
    selected === null || from === selected || to === selected;

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ display: 'block', maxWidth: '100%', height: 'auto', color: 'var(--text)' }}
      onClick={() => setSelected(null)}
    >
      {EDGES.map((e, i) => {
        const s = pos.get(e.from)!;
        const t = pos.get(e.to)!;
        const active = isEdgeActive(e.from, e.to);
        return (
          <line
            key={i}
            x1={s.x} y1={s.y} x2={t.x} y2={t.y}
            stroke={active && selected !== null ? 'var(--link)' : 'currentColor'}
            strokeWidth={active && selected !== null ? 2.5 : 1.5}
            opacity={!active && selected !== null ? 0.35 : 1}
          />
        );
      })}

      {NODES.map(node => {
        const p = pos.get(node.id)!;
        const active = isNodeActive(node.id);
        const isSelected = selected === node.id;
        return (
          <g
            key={node.id}
            onClick={e => { e.stopPropagation(); setSelected(s => s === node.id ? null : node.id); }}
            style={{ cursor: 'pointer' }}
          >
            <circle
              cx={p.x} cy={p.y} r={NODE_RADIUS}
              fill={active && selected !== null ? 'var(--env-theorem-bg)' : 'var(--bg)'}
              stroke={active && selected !== null ? 'var(--link)' : 'currentColor'}
              strokeWidth={isSelected ? 2.5 : 1.5}
              strokeOpacity={!active && selected !== null ? 0.35 : 1}
            />
            <text
              x={p.x} y={p.y}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={13}
              fill="currentColor"
              opacity={!active && selected !== null ? 0.45 : 1}
              style={{ userSelect: 'none' }}
            >
              <tspan dy="-2">{node.id[0]}-x</tspan>
              <tspan dy="5" fontSize="10">{node.id[2]}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}
