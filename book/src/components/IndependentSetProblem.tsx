import { useState, useMemo, useEffect, useRef } from 'react';

type Node = { id: string; weight: number };
type Edge = { from: string; to: string };
type Pos = { x: number; y: number };
type GraphState = { nodes: Node[]; edges: Edge[]; positions: Pos[] };

interface Props {
  nodes?: Node[];
  edges?: Edge[];
  randomN?: number;
  randomP?: number;
  width: number;
  height: number;
  nodeRadius?: number;
  labelFontSize?: number;
}

function circleLayout(n: number, w: number, h: number, r: number): Pos[] {
  const cx = w / 2, cy = h / 2;
  const rad = Math.min(w / 2, h / 2) - r - 12;
  return Array.from({ length: n }, (_, i) => ({
    x: cx + rad * Math.cos((2 * Math.PI * i) / n - Math.PI / 2),
    y: cy + rad * Math.sin((2 * Math.PI * i) / n - Math.PI / 2),
  }));
}

function makeRandomGraph(n: number, p: number): { nodes: Node[]; edges: Edge[] } {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const ids = Array.from({ length: n }, (_, i) => (n <= 26 ? letters[i] : String(i + 1)));
  const nodes = ids.map(id => ({ id, weight: Math.floor(Math.random() * 9) + 1 }));
  const edges: Edge[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (Math.random() < p) edges.push({ from: ids[i], to: ids[j] });
  return { nodes, edges };
}

function bruteForceOptimal(nodes: Node[], adj: Map<string, Set<string>>): Set<string> {
  const n = nodes.length;
  let bestWeight = 0;
  let bestSet = new Set<string>();
  for (let mask = 1; mask < (1 << n); mask++) {
    const sel = nodes.filter((_, i) => (mask >> i) & 1);
    const ids = sel.map(n => n.id);
    let valid = true;
    outer: for (const u of ids)
      for (const v of ids)
        if (adj.get(u)?.has(v)) { valid = false; break outer; }
    if (valid) {
      const w = sel.reduce((s, n) => s + n.weight, 0);
      if (w > bestWeight) { bestWeight = w; bestSet = new Set(ids); }
    }
  }
  return bestSet;
}

const btnStyle: React.CSSProperties = {
  padding: '4px 14px',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  background: 'var(--bg)',
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: '0.9em',
};

export function IndependentSetProblem({
  nodes: propNodes,
  edges: propEdges,
  randomN,
  randomP,
  width,
  height,
  nodeRadius = 26,
  labelFontSize = 18,
}: Props) {
  const isRandom = !propNodes;

  function buildGraph(): GraphState {
    const { nodes, edges } = isRandom
      ? makeRandomGraph(randomN!, randomP!)
      : { nodes: propNodes!, edges: propEdges! };
    return { nodes, edges, positions: circleLayout(nodes.length, width, height, nodeRadius) };
  }

  const [graph, setGraph] = useState<GraphState>(buildGraph);
  const [selected, setSelected] = useState(() => new Set<string>());
  const [best, setBest] = useState<{ ids: Set<string>; weight: number } | null>(null);
  const [optimal, setOptimal] = useState<Set<string> | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const prevConflicting = useRef(new Set<string>());

  const { nodes, edges, positions } = graph;

  const adj = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const { from, to } of edges) {
      if (!m.has(from)) m.set(from, new Set());
      if (!m.has(to)) m.set(to, new Set());
      m.get(from)!.add(to);
      m.get(to)!.add(from);
    }
    return m;
  }, [edges]);

  const posMap = useMemo(
    () => new Map(nodes.map((n, i) => [n.id, positions[i]])),
    [nodes, positions]
  );
  const weightMap = useMemo(
    () => new Map(nodes.map(n => [n.id, n.weight])),
    [nodes]
  );

  const conflictingEdges = useMemo(() => {
    const s = new Set<string>();
    for (const { from, to } of edges)
      if (selected.has(from) && selected.has(to)) s.add(`${from},${to}`);
    return s;
  }, [selected, edges]);

  const conflictingNodes = useMemo(() => {
    const s = new Set<string>();
    for (const key of conflictingEdges) {
      const [u, v] = key.split(',');
      s.add(u); s.add(v);
    }
    return s;
  }, [conflictingEdges]);

  const isValid = conflictingEdges.size === 0;
  const currentWeight = [...selected].reduce((s, id) => s + (weightMap.get(id) ?? 0), 0);
  const optWeight = optimal ? [...optimal].reduce((s, id) => s + (weightMap.get(id) ?? 0), 0) : 0;

  useEffect(() => {
    const newConflicts = [...conflictingNodes].filter(id => !prevConflicting.current.has(id));
    if (newConflicts.length > 0) setShakeKey(k => k + 1);
    prevConflicting.current = new Set(conflictingNodes);

    if (isValid && selected.size > 0)
      setBest(prev => (!prev || currentWeight > prev.weight)
        ? { ids: new Set(selected), weight: currentWeight }
        : prev);
  }, [conflictingNodes, isValid, selected, currentWeight]);

  function toggleNode(id: string) {
    if (optimal) return;
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function restoreBest() {
    if (best) setSelected(new Set(best.ids));
    setOptimal(null);
  }

  function revealOptimal() {
    const opt = bruteForceOptimal(nodes, adj);
    const optWeight = [...opt].reduce((s, id) => s + (weightMap.get(id) ?? 0), 0);
    setOptimal(best?.weight === optWeight ? best.ids : opt);
  }

  function reset() {
    setSelected(new Set());
    setBest(null);
    setOptimal(null);
    prevConflicting.current = new Set();
  }

  function newGraph() {
    setGraph(buildGraph());
    reset();
  }

  function nodeColors(id: string) {
    if (conflictingNodes.has(id))
      return { fill: '#fee2e2', stroke: '#dc2626', text: '#dc2626' };
    if (selected.has(id) && optimal?.has(id))
      return { fill: '#1d4ed8', stroke: '#4ade80', text: 'white' };
    if (selected.has(id))
      return { fill: '#1d4ed8', stroke: '#1e40af', text: 'white' };
    if (optimal?.has(id))
      return { fill: 'var(--bg)', stroke: '#4ade80', text: 'var(--text)' };
    return { fill: 'var(--bg)', stroke: 'var(--text)', text: 'var(--text)' };
  }

  const isBestCurrent = best !== null
    && selected.size === best.ids.size
    && [...selected].every(id => best.ids.has(id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <svg width={width} height={height} style={{ display: 'block', maxWidth: '100%', color: 'var(--text)' }}>
        <style>{`
          @keyframes isp-shake {
            0%,100% { transform: translateX(0); }
            20%      { transform: translateX(-4px); }
            40%      { transform: translateX(4px); }
            60%      { transform: translateX(-4px); }
            80%      { transform: translateX(4px); }
          }
          .isp-shake { animation: isp-shake 0.4s ease; }
        `}</style>

        {/* Edges */}
        {edges.map((edge, i) => {
          const s = posMap.get(edge.from)!;
          const t = posMap.get(edge.to)!;
          const conflicting =
            conflictingEdges.has(`${edge.from},${edge.to}`) ||
            conflictingEdges.has(`${edge.to},${edge.from}`);
          return (
            <line
              key={conflicting ? `${shakeKey}-e${i}` : `e${i}`}
              x1={s.x} y1={s.y} x2={t.x} y2={t.y}
              stroke={conflicting ? '#dc2626' : 'var(--text)'}
              strokeWidth={conflicting ? 2.5 : 1.5}
              className={conflicting ? 'isp-shake' : undefined}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map(node => {
          const p = posMap.get(node.id)!;
          const { fill, stroke, text } = nodeColors(node.id);
          const conflicting = conflictingNodes.has(node.id);
          const isOpt = optimal?.has(node.id);
          return (
            <g
              key={conflicting ? `${shakeKey}-${node.id}` : node.id}
              onClick={() => toggleNode(node.id)}
              style={{ cursor: optimal ? 'default' : 'pointer' }}
              className={conflicting ? 'isp-shake' : undefined}
            >
              <circle
                cx={p.x} cy={p.y} r={nodeRadius}
                fill={fill}
                stroke={stroke}
                strokeWidth={isOpt && !conflicting ? 3 : 1.5}
              />
              <text
                x={p.x} y={p.y - nodeRadius * 0.2}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={labelFontSize} fill={text}
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {node.id}
              </text>
              <text
                x={p.x} y={p.y + nodeRadius * 0.45}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={labelFontSize * 0.65} fill={text}
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {node.weight}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Status */}
      <div style={{ fontSize: '0.9em', textAlign: 'center', lineHeight: 1.6 }}>
        <div>
          {'Selected weight: '}
          <strong>{currentWeight}</strong>
          {!isValid && (
            <span style={{ color: '#dc2626', marginLeft: '8px' }}>
              not an independent set
            </span>
          )}
        </div>
        {best && (
          <div style={{ color: 'var(--text-muted)' }}>
            {'Best found: '}
            <strong style={{ color: 'var(--text)' }}>{best.weight}</strong>
          </div>
        )}
        {optimal && (
          <div style={{ color: '#16a34a', fontWeight: 600 }}>
            {'Optimal: '}
            {optWeight}
            {best?.weight === optWeight ? ' — you found it!' : ''}
          </div>
        )}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={reset} style={btnStyle}>
          Reset
        </button>
        <button
          onClick={restoreBest}
          disabled={!best || isBestCurrent}
          style={btnStyle}
        >
          Restore best ({best?.weight ?? 0})
        </button>
        <button onClick={revealOptimal} style={btnStyle}>
          Reveal optimal
        </button>
        {isRandom && (
          <button onClick={newGraph} style={btnStyle}>
            New graph
          </button>
        )}
      </div>
    </div>
  );
}
