import { useState, useMemo, useId, useRef, useEffect } from 'react';

type Node = { id: string; x: number; y: number };
type UEdge = { u: string; v: string; weight: number };

interface Props {
  width?: number;
  height?: number;
  nodeRadius?: number;
  labelFontSize?: number;
  edgeWeightFontSize?: number;
  /** 0–1 multiplier applied to all edge probabilities. 1 = current defaults, 0 = minimum connectivity only. */
  density?: number;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function edgeKey(a: string, b: string) { return a < b ? `${a},${b}` : `${b},${a}`; }
function randInt(lo: number, hi: number) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }

// ── Random graph ─────────────────────────────────────────────────────────────

const GROUPS = [['a', 'b'], ['c', 'd'], ['e', 'f']] as const;

const POSITIONS: Record<string, { x: number; y: number }> = {
  a: { x: 0.08, y: 0.78 }, b: { x: 0.08, y: 0.22 },
  c: { x: 0.46, y: 0.88 }, d: { x: 0.46, y: 0.12 },
  e: { x: 0.84, y: 0.78 }, f: { x: 0.84, y: 0.22 },
};

function makeRandomGraph(density = 1): { nodes: Node[]; edges: UEdge[]; root: string } {
  const ids = GROUPS.flat() as string[];
  const nodes: Node[] = ids.map(id => ({ id, ...POSITIONS[id] }));
  const edgeSet = new Set<string>();
  const edges: UEdge[] = [];

  function tryAdd(u: string, v: string, lo: number, hi: number) {
    const k = edgeKey(u, v);
    if (edgeSet.has(k)) return;
    edgeSet.add(k);
    edges.push({ u, v, weight: randInt(lo, hi) });
  }

  // Guarantee one edge between each pair of adjacent column-groups
  for (let g = 0; g < GROUPS.length - 1; g++) {
    const u = GROUPS[g][randInt(0, GROUPS[g].length - 1)];
    const v = GROUPS[g + 1][randInt(0, GROUPS[g + 1].length - 1)];
    tryAdd(u, v, 1, 9);
  }

  // Additional inter-group edges
  for (let i = 0; i < GROUPS.length; i++) {
    for (let j = i + 1; j < GROUPS.length; j++) {
      const dist = j - i;
      const [prob, lo, hi]: [number, number, number] = dist === 1 ? [0.6 * density, 1, 9] : [0.15 * density, 5, 14];
      for (const u of GROUPS[i])
        for (const v of GROUPS[j])
          if (Math.random() < prob) tryAdd(u, v, lo, hi);
    }
  }

  // Intra-group edges
  for (const g of GROUPS)
    if (Math.random() < 0.45 * density) tryAdd(g[0], g[1], 1, 7);

  // BFS connectivity — patch any isolated nodes
  const adj = new Map<string, string[]>(ids.map(id => [id, []]));
  for (const e of edges) { adj.get(e.u)!.push(e.v); adj.get(e.v)!.push(e.u); }
  const visited = new Set<string>([ids[0]]);
  const q = [ids[0]];
  while (q.length) {
    const v = q.shift()!;
    for (const w of adj.get(v)!) if (!visited.has(w)) { visited.add(w); q.push(w); }
  }
  for (const id of ids) {
    if (!visited.has(id)) {
      const u = [...visited][randInt(0, visited.size - 1)];
      tryAdd(u, id, 1, 9);
      adj.get(u)!.push(id); adj.get(id)!.push(u);
      visited.add(id);
    }
  }

  const root = ids[randInt(0, ids.length - 1)];
  return { nodes, edges, root };
}

// ── Coordinate mapping ────────────────────────────────────────────────────────

function toSvg(x: number, y: number, w: number, h: number, pad: number) {
  if (x > 1 || y > 1) return { x, y };
  return { x: pad + x * (w - 2 * pad), y: (h - pad) - y * (h - 2 * pad) };
}

// ── Edge geometry & label conflict resolution ─────────────────────────────────

const CURVE = 60;
const CHAR_W = 0.62;
const LABEL_PAD_X = 5;
const LABEL_PAD_Y = 3;

type EdgeGeom = {
  edge: UEdge;
  x1: number; y1: number; x2: number; y2: number;
  px: number; py: number;
  mx: number; my: number;
  curveOffset: number;
};

function labelPos(g: EdgeGeom) {
  return { lx: g.mx + g.px * g.curveOffset * 0.5, ly: g.my + g.py * g.curveOffset * 0.5 };
}

function labelSize(weight: number, fontSize: number) {
  return {
    w: String(weight).length * fontSize * CHAR_W + LABEL_PAD_X * 2,
    h: fontSize + LABEL_PAD_Y * 2,
  };
}

function labelsConflict(a: EdgeGeom, b: EdgeGeom, fontSize: number) {
  const la = labelPos(a), lb = labelPos(b);
  const sa = labelSize(a.edge.weight, fontSize), sb = labelSize(b.edge.weight, fontSize);
  return Math.abs(la.lx - lb.lx) < (sa.w + sb.w) / 2
      && Math.abs(la.ly - lb.ly) < (sa.h + sb.h) / 2;
}

function computeEdgeGeom(
  edges: UEdge[],
  posMap: Map<string, { x: number; y: number }>,
  nodeRadius: number,
  fontSize: number,
): EdgeGeom[] {
  const geom: EdgeGeom[] = edges.map(edge => {
    const s = posMap.get(edge.u)!, t = posMap.get(edge.v)!;
    const dx = t.x - s.x, dy = t.y - s.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len, uy = dy / len;
    return {
      edge,
      x1: s.x + ux * nodeRadius, y1: s.y + uy * nodeRadius,
      x2: t.x - ux * nodeRadius, y2: t.y - uy * nodeRadius,
      px: -uy, py: ux,
      mx: (s.x + t.x) / 2, my: (s.y + t.y) / 2,
      curveOffset: 0,
    };
  });

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < geom.length; i++) {
      for (let j = i + 1; j < geom.length; j++) {
        if (!labelsConflict(geom[i], geom[j], fontSize)) continue;
        const a = geom[i], b = geom[j];
        const dot = (b.mx - a.mx) * a.px + (b.my - a.my) * a.py;
        const sign = dot <= 0 ? 1 : -1;
        a.curveOffset += sign * CURVE;
        b.curveOffset -= sign * CURVE;
      }
    }
  }
  return geom;
}

// ── Algorithm state ───────────────────────────────────────────────────────────

type Phase = 'select-edge' | 'done';

type IterRecord = {
  addedEdge: UEdge | null;
  U: string[];
};

type Snapshot = {
  phase: Phase;
  U: Set<string>;
  T: Set<string>;
  history: IterRecord[];
};

function makeInitSnapshot(root: string, nodeCount: number): Snapshot {
  return {
    phase: nodeCount <= 1 ? 'done' : 'select-edge',
    U: new Set([root]),
    T: new Set(),
    history: [{ addedEdge: null, U: [root] }],
  };
}

// ── Table styles ──────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  padding: '3px 10px',
  textAlign: 'center',
  fontWeight: 600,
  background: 'color-mix(in srgb, currentColor 6%, var(--bg))',
};

const tdBase: React.CSSProperties = {
  border: '1px solid var(--border)',
  padding: '3px 10px',
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function PrimAlgo({
  width = 520,
  height = 340,
  nodeRadius = 22,
  labelFontSize = 18,
  edgeWeightFontSize = 14,
  density = 1,
}: Props) {
  const uid = useId().replace(/:/g, '');

  const [graph, setGraph] = useState(() => makeRandomGraph(density));
  const { nodes, edges, root } = graph;

  // ── Geometry ─────────────────────────────────────────────────────────────

  const pad = nodeRadius + 6;
  const posMap = useMemo(
    () => new Map(nodes.map(n => [n.id, toSvg(n.x, n.y, width, height, pad)])),
    [nodes, width, height, pad],
  );
  const edgeGeom = useMemo(
    () => computeEdgeGeom(edges, posMap, nodeRadius, edgeWeightFontSize),
    [edges, posMap, nodeRadius, edgeWeightFontSize],
  );

  // ── Snapshot navigation ───────────────────────────────────────────────────

  const [snapshots, setSnapshots] = useState<Snapshot[]>(() => [makeInitSnapshot(root, nodes.length)]);
  const [stepIndex, setStepIndex] = useState(0);
  const snap = snapshots[stepIndex];
  const { phase, U, T, history } = snap;

  // ── Toast / wrong-edge flash ──────────────────────────────────────────────

  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const [wrongEdge, setWrongEdge] = useState<{ edgeId: string; animKey: number } | null>(null);
  const wrongTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (wrongTimer.current) clearTimeout(wrongTimer.current);
  }, []);

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t => ({ msg, key: (t?.key ?? 0) + 1 }));
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  function flashWrongEdge(k: string) {
    if (wrongTimer.current) clearTimeout(wrongTimer.current);
    setWrongEdge(w => ({ edgeId: k, animKey: (w?.animKey ?? 0) + 1 }));
    wrongTimer.current = setTimeout(() => setWrongEdge(null), 900);
  }

  // ── Snapshot helpers ──────────────────────────────────────────────────────

  function pushSnap(s: Snapshot) {
    setSnapshots(prev => [...prev.slice(0, stepIndex + 1), s]);
    setStepIndex(i => i + 1);
  }

  // ── Core action ───────────────────────────────────────────────────────────

  function applyAddEdge(edge: UEdge) {
    const newU = new Set(U);
    const newT = new Set(T);
    newU.add(U.has(edge.u) ? edge.v : edge.u);
    newT.add(edgeKey(edge.u, edge.v));
    const sortedU = [...newU].sort();
    pushSnap({
      phase: newU.size === nodes.length ? 'done' : 'select-edge',
      U: newU, T: newT,
      history: [...history, { addedEdge: edge, U: sortedU }],
    });
  }

  function cutEdges() {
    return edges.filter(e => {
      const uIn = U.has(e.u), vIn = U.has(e.v);
      return (uIn && !vIn) || (!uIn && vIn);
    });
  }

  // ── Click handler ─────────────────────────────────────────────────────────

  function handleEdgeClick(edge: UEdge) {
    if (phase !== 'select-edge') return;
    const uIn = U.has(edge.u), vIn = U.has(edge.v);
    const k = edgeKey(edge.u, edge.v);

    if (!uIn && !vIn) {
      flashWrongEdge(k);
      showToast(`Neither endpoint of (${edge.u}, ${edge.v}) is in the tree yet`);
      return;
    }
    if (uIn && vIn) {
      flashWrongEdge(k);
      showToast(`Both endpoints of (${edge.u}, ${edge.v}) are already in the tree — adding it would create a cycle`);
      return;
    }
    const minW = Math.min(...cutEdges().map(e => e.weight));
    if (edge.weight > minW) {
      flashWrongEdge(k);
      showToast(`(${edge.u}, ${edge.v}) is not the minimum-cost edge spanning U and V\\U`);
      return;
    }
    applyAddEdge(edge);
  }

  // ── Prev / Next ───────────────────────────────────────────────────────────

  function goPrev() { if (stepIndex > 0) setStepIndex(i => i - 1); }

  function goNext() {
    if (phase !== 'select-edge') return;
    const cut = cutEdges();
    if (!cut.length) return;
    const minW = Math.min(...cut.map(e => e.weight));
    applyAddEdge(cut.find(e => e.weight === minW)!);
  }

  // ── Reset / New graph ─────────────────────────────────────────────────────

  function clearTimers() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (wrongTimer.current) clearTimeout(wrongTimer.current);
  }

  function reset() {
    clearTimers();
    setSnapshots([makeInitSnapshot(root, nodes.length)]);
    setStepIndex(0);
    setToast(null);
    setWrongEdge(null);
  }

  function newGraph() {
    clearTimers();
    const g = makeRandomGraph(density);
    setGraph(g);
    setSnapshots([makeInitSnapshot(g.root, g.nodes.length)]);
    setStepIndex(0);
    setToast(null);
    setWrongEdge(null);
  }

  // ── Visual state ──────────────────────────────────────────────────────────

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

  // ── Status ────────────────────────────────────────────────────────────────

  const totalWeight = [...T].reduce((sum, k) => {
    const e = edges.find(e => edgeKey(e.u, e.v) === k);
    return sum + (e?.weight ?? 0);
  }, 0);

  const statusMsg = phase === 'done'
    ? `MST complete! Total weight: ${totalWeight}`
    : `Click the minimum-cost edge with one endpoint in the tree (blue) and one outside.`;

  // Render edges grouped so T edges draw on top
  const sortedGeom = [...edgeGeom].sort((a, b) => {
    const rank = (e: UEdge) => T.has(edgeKey(e.u, e.v)) ? 2 : ((U.has(e.u) !== U.has(e.v)) ? 1 : 0);
    return rank(a.edge) - rank(b.edge);
  });

  const glowId = `prim-glow-${uid}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <button onClick={newGraph}>New graph</button>

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

          {/* Pass 1: edge strokes and hit areas */}
          {sortedGeom.map((g) => {
            const { x1, y1, x2, y2, mx, my, px, py, curveOffset, edge } = g;
            const cpx = mx + px * curveOffset;
            const cpy = my + py * curveOffset;
            const curved = curveOffset !== 0;
            const k = edgeKey(edge.u, edge.v);
            const vis = edgeVisual(edge);
            const isWrong = wrongEdge?.edgeId === k;
            const inT = T.has(k);
            const pathD = curved
              ? `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`
              : undefined;

            return (
              <g
                key={isWrong ? `wrong-${wrongEdge!.animKey}-${k}` : k}
                onClick={() => handleEdgeClick(edge)}
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

          {/* Pass 2: weight labels always on top of edges and nodes */}
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

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={goPrev} disabled={stepIndex === 0}>← Prev</button>
        <button
          onClick={phase === 'done' ? reset : () => {}}
          style={{ visibility: phase === 'done' ? 'visible' : 'hidden' }}
        >
          Reset
        </button>
        <button onClick={goNext} disabled={phase === 'done'}>Next →</button>
      </div>

      {/* Status */}
      <div style={{
        fontSize: '0.9em', textAlign: 'center',
        color: phase === 'done' ? '#16a34a' : 'var(--text-muted)',
        fontWeight: phase === 'done' ? 600 : 400,
      }}>
        {statusMsg}
      </div>

      {/* Tracking table */}
      <div style={{ overflowX: 'auto', maxWidth: `${width}px`, width: '100%' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.82em', margin: '0 auto' }}>
          <thead>
            <tr>
              <th style={thStyle}>edge added</th>
              <th style={{ ...thStyle, borderRight: '3px solid var(--text-muted)' }}>weight</th>
              <th style={thStyle}><em>U</em></th>
            </tr>
          </thead>
          <tbody>
            {history.map((rec, row) => (
              <tr key={row}>
                <td style={tdBase}>
                  {rec.addedEdge
                    ? `(${[rec.addedEdge.u, rec.addedEdge.v].sort().join(', ')})`
                    : '—'}
                </td>
                <td style={{ ...tdBase, borderRight: '3px solid var(--text-muted)' }}>
                  {rec.addedEdge?.weight ?? '—'}
                </td>
                <td style={tdBase}>{`{${rec.U.join(', ')}}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
