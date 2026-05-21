import { useState, useMemo } from 'react';

const NODES = ['1', '2', '3', '4', '5', '6'];
const WIDTH = 400;
const HEIGHT = 360;
const NODE_R = 22;

function edgeKey(u: string, v: string) {
  return u < v ? `${u},${v}` : `${v},${u}`;
}

const ALL_EDGES: string[] = (() => {
  const out: string[] = [];
  for (let i = 0; i < NODES.length; i++)
    for (let j = i + 1; j < NODES.length; j++)
      out.push(edgeKey(NODES[i], NODES[j]));
  return out;
})();

// Node positions: regular hexagon, top vertex first
const POS = new Map<string, { x: number; y: number }>(
  NODES.map((id, i) => {
    const a = (2 * Math.PI * i) / NODES.length - Math.PI / 2;
    const r = Math.min(WIDTH, HEIGHT) / 2 - NODE_R - 18;
    return [id, { x: WIDTH / 2 + r * Math.cos(a), y: HEIGHT / 2 + r * Math.sin(a) }];
  })
);

function randomSpanningTree(): Set<string> {
  const shuffled = [...ALL_EDGES].sort(() => Math.random() - 0.5);
  const parent = new Map<string, string>(NODES.map(n => [n, n]));
  function find(x: string): string {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }
  const tree = new Set<string>();
  for (const e of shuffled) {
    const [u, v] = e.split(',');
    const pu = find(u), pv = find(v);
    if (pu !== pv) { parent.set(pu, pv); tree.add(e); }
    if (tree.size === NODES.length - 1) break;
  }
  return tree;
}

function findTreePath(src: string, dst: string, treeEdges: Set<string>): string[] {
  const adj = new Map<string, string[]>(NODES.map(n => [n, []]));
  for (const e of treeEdges) {
    const [u, v] = e.split(',');
    adj.get(u)!.push(v);
    adj.get(v)!.push(u);
  }
  const prev = new Map<string, string | null>([[src, null]]);
  const q = [src];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c === dst) break;
    for (const nb of adj.get(c) ?? [])
      if (!prev.has(nb)) { prev.set(nb, c); q.push(nb); }
  }
  const path: string[] = [];
  let node: string | null = dst;
  while (node !== null) { path.unshift(node); node = prev.get(node) ?? null; }
  return path;
}

type Phase = 'add-edge' | 'remove-from-cycle';

export function SpanningTreeExplorer() {
  const [treeEdges, setTreeEdges] = useState(() => randomSpanningTree());
  const [phase, setPhase] = useState<Phase>('add-edge');
  const [addedEdge, setAddedEdge] = useState<string | null>(null);
  const [cycleEdges, setCycleEdges] = useState<Set<string>>(new Set());

  function clickEdge(e: string) {
    if (phase === 'add-edge') {
      if (treeEdges.has(e)) return;
      const [u, v] = e.split(',');
      const path = findTreePath(u, v, treeEdges);
      const cycle = new Set<string>();
      for (let i = 0; i < path.length - 1; i++) cycle.add(edgeKey(path[i], path[i + 1]));
      cycle.add(e);
      setAddedEdge(e);
      setCycleEdges(cycle);
      setPhase('remove-from-cycle');
    } else {
      if (!cycleEdges.has(e)) return;
      if (e !== addedEdge) {
        const next = new Set(treeEdges);
        next.delete(e);
        next.add(addedEdge!);
        setTreeEdges(next);
      }
      setPhase('add-edge');
      setAddedEdge(null);
      setCycleEdges(new Set());
    }
  }

  function cancelAdd() {
    setPhase('add-edge');
    setAddedEdge(null);
    setCycleEdges(new Set());
  }

  function newTree() {
    setTreeEdges(randomSpanningTree());
    setPhase('add-edge');
    setAddedEdge(null);
    setCycleEdges(new Set());
  }

  // Layer edges: background → mid → foreground so cycle edges render on top
  const layers = useMemo(() => {
    const bg: string[] = [], mid: string[] = [], fg: string[] = [];
    for (const e of ALL_EDGES) {
      if (cycleEdges.has(e)) fg.push(e);
      else if (treeEdges.has(e)) mid.push(e);
      else bg.push(e);
    }
    return { bg, mid, fg };
  }, [treeEdges, cycleEdges]);

  function edgeStyle(e: string) {
    const inTree = treeEdges.has(e);
    const inCycle = cycleEdges.has(e);
    const isAdded = e === addedEdge;
    if (phase === 'add-edge') {
      if (inTree) return { stroke: '#2563eb', sw: 3, opacity: 1, dash: false, clickable: false };
      return { stroke: 'currentColor', sw: 1.5, opacity: 0.28, dash: true, clickable: true };
    }
    // remove-from-cycle
    if (isAdded)  return { stroke: '#dc2626', sw: 4,   opacity: 1, dash: false, clickable: true };
    if (inCycle)  return { stroke: '#ea580c', sw: 3.5, opacity: 1, dash: false, clickable: true };
    if (inTree)   return { stroke: '#2563eb', sw: 3,   opacity: 1, dash: false, clickable: false };
    return              { stroke: 'currentColor', sw: 1.5, opacity: 0.28, dash: true, clickable: false };
  }

  function renderEdge(e: string) {
    const [u, v] = e.split(',');
    const s = POS.get(u)!, t = POS.get(v)!;
    const es = edgeStyle(e);
    return (
      <g key={e} onClick={() => clickEdge(e)} style={{ cursor: es.clickable ? 'pointer' : 'default' }}>
        <line
          x1={s.x} y1={s.y} x2={t.x} y2={t.y}
          stroke={es.stroke} strokeWidth={es.sw}
          strokeOpacity={es.opacity}
          strokeDasharray={es.dash ? '6,5' : undefined}
        />
        {/* Wide transparent hit area for easier clicking */}
        <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="transparent" strokeWidth={14} />
      </g>
    );
  }

  const instruction = phase === 'add-edge'
    ? 'Click any dashed edge to add it and see the cycle it creates.'
    : 'Cycle highlighted in orange/red. Click any cycle edge to remove it and form a new spanning tree.';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      <svg
        width={WIDTH} height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ display: 'block', maxWidth: '100%', height: 'auto', color: 'var(--text)' }}
      >
        {layers.bg.map(renderEdge)}
        {layers.mid.map(renderEdge)}
        {layers.fg.map(renderEdge)}
        {NODES.map(id => {
          const p = POS.get(id)!;
          return (
            <g key={id} style={{ pointerEvents: 'none' }}>
              <circle cx={p.x} cy={p.y} r={NODE_R} fill="var(--bg)" stroke="currentColor" strokeWidth={1.5} />
              <text
                x={p.x} y={p.y}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={16} fill="currentColor"
                style={{ userSelect: 'none' }}
              >
                {id}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={{ fontSize: '0.875em', color: 'var(--text-muted)', textAlign: 'center', maxWidth: `${WIDTH}px`, lineHeight: 1.5 }}>
        {instruction}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {phase === 'remove-from-cycle' && (
          <button onClick={cancelAdd}>Cancel</button>
        )}
        <button onClick={newTree}>New spanning tree</button>
      </div>

      <div style={{ fontSize: '0.8em', color: 'var(--text-muted)', display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <span><strong style={{ color: '#2563eb' }}>—</strong> spanning tree</span>
        <span style={{ opacity: 0.7 }}>- - - non-tree edge</span>
        {phase === 'remove-from-cycle' && (
          <>
            <span><strong style={{ color: '#ea580c' }}>—</strong> cycle (tree edges)</span>
            <span><strong style={{ color: '#dc2626' }}>—</strong> added edge</span>
          </>
        )}
      </div>
    </div>
  );
}
