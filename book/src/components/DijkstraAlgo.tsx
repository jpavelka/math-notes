import { useState, useMemo, useId, useRef, useEffect } from 'react';

type Node = { id: string; x: number; y: number };
type Edge = { from: string; to: string; weight: number };

interface Props {
  nodes?: Node[];
  edges?: Edge[];
  source?: string;
  target?: string;
  randomMinEdges?: number;
  randomMaxEdges?: number;
  width?: number;
  height?: number;
  nodeRadius?: number;
  labelFontSize?: number;
  edgeWeightFontSize?: number;
  annotFontSize?: number;
}

// ── Random graph ──────────────────────────────────────────────────────────────

const GROUPS = [['s'], ['a', 'b'], ['c', 'd'], ['e', 'f'], ['t']] as const;

const RANDOM_POSITIONS: Record<string, { x: number; y: number }> = {
  s: { x: 0,    y: 0.5  },
  a: { x: 0.25, y: 0.92 },
  b: { x: 0.25, y: 0.08 },
  c: { x: 0.5,  y: 0.92 },
  d: { x: 0.5,  y: 0.08 },
  e: { x: 0.75, y: 0.92 },
  f: { x: 0.75, y: 0.08 },
  t: { x: 1,    y: 0.5  },
};

const EDGE_PARAMS: [number, [number, number]][] = [
  [0.85, [1,  5]],
  [0.45, [3,  9]],
  [0.18, [6, 13]],
  [0.07, [9, 16]],
];

function randInt(lo: number, hi: number) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function makeRandomGraph(
  minEdges?: number,
  maxEdges?: number,
): { nodes: Node[]; edges: Edge[]; source: string; target: string } {
  const nodes: Node[] = GROUPS.flat().map(id => ({ id, ...RANDOM_POSITIONS[id] }));
  const mandatory: Edge[] = [];
  const optional: Edge[] = [];

  for (let i = 0; i < GROUPS.length; i++) {
    for (let j = i + 1; j < GROUPS.length; j++) {
      const dist = j - i;
      const [prob, [lo, hi]] = EDGE_PARAMS[Math.min(dist - 1, 3)];
      let added = false;
      for (const u of GROUPS[i]) {
        for (const v of GROUPS[j]) {
          if (Math.random() < prob) {
            optional.push({ from: u, to: v, weight: randInt(lo, hi) });
            added = true;
          }
        }
      }
      if (dist === 1 && !added) {
        const u = GROUPS[i][randInt(0, GROUPS[i].length - 1)];
        const v = GROUPS[j][randInt(0, GROUPS[j].length - 1)];
        mandatory.push({ from: u, to: v, weight: randInt(lo, hi) });
      }
    }
  }

  if (maxEdges !== undefined) {
    const maxOptional = Math.max(0, maxEdges - mandatory.length);
    while (optional.length > maxOptional) optional.splice(randInt(0, optional.length - 1), 1);
  }

  const edges = [...mandatory, ...optional];

  const intoT = new Set(edges.filter(e => e.to === 't').map(e => e.from));
  if (intoT.size < 2) {
    const [lo, hi] = EDGE_PARAMS[0][1];
    const candidates = ['e', 'f', 'c', 'd', 'a', 'b'].filter(id => !intoT.has(id));
    edges.push({ from: candidates[randInt(0, candidates.length - 1)], to: 't', weight: randInt(lo, hi) });
  }

  if (minEdges !== undefined && edges.length < minEdges) {
    const existingKeys = new Set(edges.map(e => `${e.from},${e.to}`));
    const eligible: Array<{ from: string; to: string; lo: number; hi: number }> = [];
    for (let i = 0; i < GROUPS.length; i++) {
      for (let j = i + 1; j < GROUPS.length; j++) {
        const dist = j - i;
        const [, [lo, hi]] = EDGE_PARAMS[Math.min(dist - 1, 3)];
        for (const u of GROUPS[i])
          for (const v of GROUPS[j])
            if (!existingKeys.has(`${u},${v}`))
              eligible.push({ from: u, to: v, lo, hi });
      }
    }
    for (let k = eligible.length - 1; k > 0; k--) {
      const r = randInt(0, k);
      [eligible[k], eligible[r]] = [eligible[r], eligible[k]];
    }
    for (const e of eligible) {
      if (edges.length >= minEdges) break;
      edges.push({ from: e.from, to: e.to, weight: randInt(e.lo, e.hi) });
    }
  }

  return { nodes, edges, source: 's', target: 't' };
}

// ── Coordinate mapping ────────────────────────────────────────────────────────

function toSvg(
  x: number, y: number,
  width: number, height: number,
  pad: number,
): { x: number; y: number } {
  if (x > 1 || y > 1) return { x, y };
  return {
    x: pad + x * (width - 2 * pad),
    y: (height - pad) - y * (height - 2 * pad),
  };
}

// ── Edge geometry & conflict resolution ──────────────────────────────────────

const CURVE = 65;
const CHAR_W = 0.62;
const LABEL_PAD_X = 5;
const LABEL_PAD_Y = 3;

type EdgeGeom = {
  edge: Edge;
  x1: number; y1: number; x2: number; y2: number;
  ux: number; uy: number;
  px: number; py: number;
  mx: number; my: number;
  curveOffset: number;
};

function labelPos(g: EdgeGeom) {
  return {
    lx: g.mx + g.px * g.curveOffset * 0.5,
    ly: g.my + g.py * g.curveOffset * 0.5,
  };
}

function labelSize(weight: number, fontSize: number) {
  const w = String(weight).length * fontSize * CHAR_W + LABEL_PAD_X * 2;
  const h = fontSize + LABEL_PAD_Y * 2;
  return { w, h };
}

function conflicts(a: EdgeGeom, b: EdgeGeom, fontSize: number) {
  const la = labelPos(a), lb = labelPos(b);
  const sa = labelSize(a.edge.weight, fontSize), sb = labelSize(b.edge.weight, fontSize);
  return Math.abs(la.lx - lb.lx) < (sa.w + sb.w) / 2
      && Math.abs(la.ly - lb.ly) < (sa.h + sb.h) / 2;
}

function computeEdgeGeom(
  edges: Edge[],
  posMap: Map<string, { x: number; y: number }>,
  nodeRadius: number,
  fontSize: number,
  forcedCurves: Record<string, number> = {},
): EdgeGeom[] {
  const geom: EdgeGeom[] = edges.map(edge => {
    const s = posMap.get(edge.from)!;
    const t = posMap.get(edge.to)!;
    const dx = t.x - s.x, dy = t.y - s.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
    const key = `${edge.from},${edge.to}`;
    return {
      edge,
      x1: s.x + ux * nodeRadius, y1: s.y + uy * nodeRadius,
      x2: t.x - ux * nodeRadius, y2: t.y - uy * nodeRadius,
      ux, uy, px, py,
      mx: (s.x + t.x) / 2, my: (s.y + t.y) / 2,
      curveOffset: forcedCurves[key] ?? 0,
    };
  });

  const forcedKeys = new Set(Object.keys(forcedCurves));

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < geom.length; i++) {
      for (let j = i + 1; j < geom.length; j++) {
        if (!conflicts(geom[i], geom[j], fontSize)) continue;
        const a = geom[i], b = geom[j];
        const aForced = forcedKeys.has(`${a.edge.from},${a.edge.to}`);
        const bForced = forcedKeys.has(`${b.edge.from},${b.edge.to}`);
        if (aForced && bForced) continue;
        const dot = (b.mx - a.mx) * a.px + (b.my - a.my) * a.py;
        const sign = dot <= 0 ? 1 : -1;
        if (!aForced) a.curveOffset += sign * CURVE;
        if (!bForced) b.curveOffset -= sign * CURVE;
      }
    }
  }

  return geom;
}

// ── Algorithm state snapshot ──────────────────────────────────────────────────
// One snapshot per phase transition. The snapshots array grows as the user
// makes progress; stepIndex navigates through it.

type Phase = 'select-u' | 'update-edges' | 'build-path' | 'done';

type IterRecord = {
  u: string | null;
  d: Map<string, number>;
  p: Map<string, string | null>;
};

type Snapshot = {
  phase: Phase;
  U: Set<string>;
  currentU: string | null;
  updateSet: Set<string>;        // vertices needing d/p update this iteration
  identifiedUpdates: Set<string>; // subset the user has correctly clicked
  workingD: Map<string, number>;
  workingP: Map<string, string | null>;
  pathBuilt: string[];
  pathCurrent: string | null;
  history: IterRecord[];
};

function makeInitSnapshot(nodes: Node[], source: string): Snapshot {
  const d = new Map(nodes.map(n => [n.id, n.id === source ? 0 : Infinity]));
  const p = new Map<string, string | null>(nodes.map(n => [n.id, null]));
  return {
    phase: 'select-u',
    U: new Set(nodes.map(n => n.id)),
    currentU: null,
    updateSet: new Set(),
    identifiedUpdates: new Set(),
    workingD: new Map(d),
    workingP: new Map(p),
    pathBuilt: [],
    pathCurrent: null,
    history: [{ u: null, d, p }],
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────


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

export function DijkstraAlgo({
  nodes: propNodes,
  edges: propEdges,
  source: propSource,
  target: propTarget,
  randomMinEdges,
  randomMaxEdges,
  width = 520,
  height = 360,
  nodeRadius = 28,
  labelFontSize = 20,
  edgeWeightFontSize = 15,
  annotFontSize = 14,
}: Props) {
  const isRandom = !propNodes;
  const uid = useId().replace(/:/g, '');

  function buildGraph() {
    if (!isRandom)
      return { nodes: propNodes!, edges: propEdges!, source: propSource!, target: propTarget! };
    return makeRandomGraph(randomMinEdges, randomMaxEdges);
  }

  const [graph, setGraph] = useState(buildGraph);
  const { nodes, edges, source, target } = graph;

  // ── Geometry ─────────────────────────────────────────────────────────────

  const pad = nodeRadius + 6;
  const posMap = useMemo(
    () => new Map(nodes.map(n => [n.id, toSvg(n.x, n.y, width, height, pad)])),
    [nodes, width, height, pad],
  );
  const markerId = `dijkstra-arrow-${uid}`;
  const markerIdGreen = `dijkstra-arrow-green-${uid}`;
  const glowFilterId = `dijkstra-glow-${uid}`;
  const forcedCurves: Record<string, number> = isRandom
    ? { 'a,e': -CURVE * 1.25, 'b,f': CURVE * 1.25 }
    : {};
  const edgeGeom = useMemo(
    () => computeEdgeGeom(edges, posMap, nodeRadius, edgeWeightFontSize, forcedCurves),
    [edges, posMap, nodeRadius, edgeWeightFontSize],
  );

  // ── Snapshot state ────────────────────────────────────────────────────────
  // snapshots[0..stepIndex] = history of phase transitions
  // Navigating back decrements stepIndex without discarding future snapshots.
  // Any forward action (interactive or auto) trims snapshots to stepIndex+1
  // then pushes the new state, so divergent choices replace the old future.

  const [snapshots, setSnapshots] = useState<Snapshot[]>(() => [makeInitSnapshot(nodes, source)]);
  const [stepIndex, setStepIndex] = useState(0);

  const snap = snapshots[stepIndex];
  const { phase, U, currentU, updateSet, identifiedUpdates, workingD, workingP, pathBuilt, pathCurrent, history } = snap;
  const dMap = history[history.length - 1].d;
  const pMap = history[history.length - 1].p;
  const displayD = phase === 'update-edges' ? workingD : dMap;
  const displayP = phase === 'update-edges' ? workingP : pMap;

  // ── Toast ─────────────────────────────────────────────────────────────────

  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const [transitioning, setTransitioning] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>();
  const [wrongNode, setWrongNode] = useState<{ id: string; key: number } | null>(null);
  const wrongTimer = useRef<ReturnType<typeof setTimeout>>();
  const updatesDoneBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    if (wrongTimer.current) clearTimeout(wrongTimer.current);
  }, []);

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t => ({ msg, key: (t?.key ?? 0) + 1 }));
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  function flashWrong(id: string) {
    if (wrongTimer.current) clearTimeout(wrongTimer.current);
    setWrongNode(w => ({ id, key: (w?.key ?? 0) + 1 }));
    wrongTimer.current = setTimeout(() => setWrongNode(null), 1000);
  }

  // ── Snapshot helpers ──────────────────────────────────────────────────────

  // Push a new snapshot after the current stepIndex, trimming any future history.
  function pushSnap(newSnap: Snapshot) {
    setSnapshots(prev => [...prev.slice(0, stepIndex + 1), newSnap]);
    setStepIndex(s => s + 1);
  }

  // Update only the mutable sub-state of the current snapshot (used during update-edges
  // as the user clicks vertices one by one — not a phase transition, no new snapshot).
  function patchSnap(patch: Partial<Snapshot>) {
    setSnapshots(prev => {
      const next = [...prev];
      next[stepIndex] = { ...next[stepIndex], ...patch };
      return next;
    });
  }

  // ── Phase 1: select u ─────────────────────────────────────────────────────

  function applySelectU(nodeId: string) {
    const newU = new Set(U);
    newU.delete(nodeId);

    if (nodeId === target) {
      pushSnap({
        phase: 'build-path',
        U: newU,
        currentU: null,
        updateSet: new Set(),
        identifiedUpdates: new Set(),
        workingD: new Map(dMap),
        workingP: new Map(pMap),
        pathBuilt: [target],
        pathCurrent: target,
        history: [...history, { u: nodeId, d: new Map(dMap), p: new Map(pMap) }],
      });
      return;
    }

    const needed = new Set<string>();
    for (const edge of edges)
      if (edge.from === nodeId && newU.has(edge.to) && dMap.get(nodeId)! + edge.weight < dMap.get(edge.to)!)
        needed.add(edge.to);

    pushSnap({
      phase: 'update-edges',
      U: newU,
      currentU: nodeId,
      updateSet: needed,
      identifiedUpdates: new Set(),
      workingD: new Map(dMap),
      workingP: new Map(pMap),
      pathBuilt: [],
      pathCurrent: null,
      history: [...history], // committed only after updates-done
    });
  }

  function handleSelectU(nodeId: string) {
    if (!U.has(nodeId)) { flashWrong(nodeId); showToast(`${nodeId} has already been explored`); return; }
    const finiteU = [...U].filter(v => dMap.get(v)! < Infinity);
    if (finiteU.length === 0) return;
    const minD = Math.min(...finiteU.map(v => dMap.get(v)!));
    if (dMap.get(nodeId)! === Infinity) { flashWrong(nodeId); showToast(`d(${nodeId}) = ∞ — not yet reachable`); return; }
    if (dMap.get(nodeId)! > minD) {
      flashWrong(nodeId);
      showToast(`d(${nodeId}) = ${dMap.get(nodeId)}, which is not the minimum d(v) among unexplored vertices`);
      return;
    }
    applySelectU(nodeId);
  }

  // ── Phase 2: identify edge updates ───────────────────────────────────────

  function handleEdgeUpdate(nodeId: string) {
    if (!U.has(nodeId)) { flashWrong(nodeId); showToast(`${nodeId} has already been explored`); return; }
    const edge = edges.find(e => e.from === currentU && e.to === nodeId);
    if (!edge) { flashWrong(nodeId); showToast(`${nodeId} is not adjacent to ${currentU}`); return; }
    if (identifiedUpdates.has(nodeId)) { flashWrong(nodeId); showToast(`${nodeId} has already been updated this round`); return; }
    const dPrime = workingD.get(currentU!)! + edge.weight;
    const dv = workingD.get(nodeId)!;
    if (dPrime >= dv) {
      flashWrong(nodeId);
      showToast(`d(${currentU}) + c(${currentU},${nodeId}) = ${dPrime} ≥ d(${nodeId}) = ${dv === Infinity ? '∞' : dv}`);
      return;
    }
    const newWorkingD = new Map(workingD); newWorkingD.set(nodeId, dPrime);
    const newWorkingP = new Map(workingP); newWorkingP.set(nodeId, currentU);
    patchSnap({
      workingD: newWorkingD,
      workingP: newWorkingP,
      identifiedUpdates: new Set([...identifiedUpdates, nodeId]),
    });
  }

  function applyUpdatesDone(wD: Map<string, number>, wP: Map<string, string | null>) {
    const newHistory = [...history, { u: currentU, d: new Map(wD), p: new Map(wP) }];
    const isDone = !U.has(target) || [...U].every(v => wD.get(v)! === Infinity);
    const base = { currentU: null, updateSet: new Set<string>(), identifiedUpdates: new Set<string>(), workingD: wD, workingP: wP, history: newHistory };
    if (isDone && wD.get(target)! < Infinity) {
      pushSnap({ ...base, phase: 'build-path', U: new Set(U), pathBuilt: [target], pathCurrent: target });
    } else if (isDone) {
      pushSnap({ ...base, phase: 'done', U: new Set(U), pathBuilt: [], pathCurrent: null });
    } else {
      pushSnap({ ...base, phase: 'select-u', U: new Set(U), pathBuilt: [], pathCurrent: null });
    }
  }

  function shakeUpdatesDoneBtn() {
    const btn = updatesDoneBtnRef.current;
    if (!btn) return;
    btn.classList.remove('dijkstra-btn-error');
    void btn.offsetWidth;
    btn.classList.add('dijkstra-btn-error');
    setTimeout(() => btn.classList.remove('dijkstra-btn-error'), 700);
  }

  function handleUpdatesDone() {
    if (identifiedUpdates.size < updateSet.size) { showToast('Additional vertices require updates'); shakeUpdatesDoneBtn(); return; }
    applyUpdatesDone(new Map(workingD), new Map(workingP));
  }

  // ── Phase 3: reconstruct path ─────────────────────────────────────────────

  function applyPathBuild(nodeId: string) {
    const newPath = [nodeId, ...pathBuilt];
    const base = { phase: 'done' as Phase, U: new Set(U), currentU: null, updateSet: new Set<string>(), identifiedUpdates: new Set<string>(), workingD: new Map(dMap), workingP: new Map(pMap), history: [...history] };
    if (nodeId === source) {
      pushSnap({ ...base, phase: 'done', pathBuilt: newPath, pathCurrent: null });
    } else {
      pushSnap({ ...base, phase: 'build-path', pathBuilt: newPath, pathCurrent: nodeId });
    }
  }

  function handlePathBuild(nodeId: string) {
    if (pathBuilt.includes(nodeId)) {
      flashWrong(nodeId);
      showToast(nodeId === pathCurrent
        ? `${nodeId} is already the current vertex — click its predecessor`
        : `${nodeId} is already in the path`);
      return;
    }
    if (nodeId !== pMap.get(pathCurrent!)) {
      flashWrong(nodeId);
      showToast(`${nodeId} is not the predecessor of ${pathCurrent}`);
      return;
    }
    applyPathBuild(nodeId);
  }

  // ── Dispatch click ────────────────────────────────────────────────────────

  function handleNodeClick(nodeId: string) {
    if (transitioning) return;
    if (phase === 'select-u') handleSelectU(nodeId);
    else if (phase === 'update-edges') handleEdgeUpdate(nodeId);
    else if (phase === 'build-path') handlePathBuild(nodeId);
  }

  // ── Prev / Next ───────────────────────────────────────────────────────────

  function goPrev() {
    if (stepIndex === 0) return;
    if (transitionTimer.current) { clearTimeout(transitionTimer.current); setTransitioning(false); }
    if (wrongTimer.current) { clearTimeout(wrongTimer.current); setWrongNode(null); }
    setStepIndex(s => s - 1);
  }

  function goNext() {
    if (phase === 'done' || transitioning) return;
    if (wrongTimer.current) { clearTimeout(wrongTimer.current); setWrongNode(null); }

    if (phase === 'select-u') {
      const finiteU = [...U].filter(v => dMap.get(v)! < Infinity);
      if (finiteU.length === 0) return;
      const u = finiteU.reduce((best, v) => dMap.get(v)! < dMap.get(best)! ? v : best);
      applySelectU(u);
    } else if (phase === 'update-edges') {
      const finalD = new Map(workingD);
      const finalP = new Map(workingP);
      const allUpdated = new Set(identifiedUpdates);
      for (const v of updateSet) {
        if (!identifiedUpdates.has(v)) {
          const edge = edges.find(e => e.from === currentU && e.to === v)!;
          finalD.set(v, finalD.get(currentU!)! + edge.weight);
          finalP.set(v, currentU);
          allUpdated.add(v);
        }
      }
      if (allUpdated.size === 0) {
        applyUpdatesDone(finalD, finalP);
      } else {
        patchSnap({ workingD: finalD, workingP: finalP, identifiedUpdates: allUpdated });
        setTransitioning(true);
        transitionTimer.current = setTimeout(() => {
          setTransitioning(false);
          applyUpdatesDone(finalD, finalP);
        }, 750);
      }
    } else if (phase === 'build-path') {
      applyPathBuild(pMap.get(pathCurrent!)!);
    }
  }

  // ── Path highlight sets ───────────────────────────────────────────────────

  const highlightEdgeSet = new Set<string>();
  const highlightNodeSet = new Set<string>();
  if (phase === 'build-path' || phase === 'done') {
    for (let i = 0; i < pathBuilt.length - 1; i++)
      highlightEdgeSet.add(`${pathBuilt[i]},${pathBuilt[i + 1]}`);
    for (const v of pathBuilt) highlightNodeSet.add(v);
  }

  // ── Node visual style ─────────────────────────────────────────────────────

  function nodeStyle(id: string) {
    if (phase === 'done') {
      if (highlightNodeSet.has(id))
        return { fill: '#bbf7d0', stroke: '#16a34a', text: '#16a34a', sw: 2.5, dim: false, glow: true };
      return { fill: 'var(--bg)', stroke: 'currentColor', text: 'currentColor', sw: 1.5, dim: true, glow: false };
    }
    if (phase === 'build-path') {
      if (id === pathCurrent)
        return { fill: '#dbeafe', stroke: '#2563eb', text: '#1e3a8a', sw: 2, dim: false, glow: false };
      if (highlightNodeSet.has(id))
        return { fill: '#bbf7d0', stroke: '#16a34a', text: '#16a34a', sw: 2.5, dim: false, glow: false };
      return { fill: 'var(--bg)', stroke: 'currentColor', text: 'currentColor', sw: 1.5, dim: true, glow: false };
    }
    if (phase === 'update-edges') {
      if (id === currentU)
        return { fill: '#dbeafe', stroke: '#2563eb', text: '#1e3a8a', sw: 2, dim: false, glow: false };
      if (identifiedUpdates.has(id))
        return { fill: '#dcfce7', stroke: '#16a34a', text: '#16a34a', sw: 1.5, dim: false, glow: false };
      if (!U.has(id))
        return { fill: 'var(--bg)', stroke: 'currentColor', text: 'currentColor', sw: 1.5, dim: true, glow: false };
      return { fill: 'var(--bg)', stroke: 'currentColor', text: 'currentColor', sw: 1.5, dim: false, glow: false };
    }
    // select-u
    if (!U.has(id))
      return { fill: 'var(--bg)', stroke: 'currentColor', text: 'currentColor', sw: 1.5, dim: true, glow: false };
    return { fill: 'var(--bg)', stroke: 'currentColor', text: 'currentColor', sw: 1.5, dim: false, glow: false };
  }

  // ── Reset / New graph ─────────────────────────────────────────────────────

  function reset() {
    setSnapshots([makeInitSnapshot(nodes, source)]);
    setStepIndex(0);
    setToast(null);
    setTransitioning(false);
    setWrongNode(null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    if (wrongTimer.current) clearTimeout(wrongTimer.current);
  }

  function newGraph() {
    const g = makeRandomGraph(randomMinEdges, randomMaxEdges);
    setGraph(g);
    setSnapshots([makeInitSnapshot(g.nodes, g.source)]);
    setStepIndex(0);
    setToast(null);
    setTransitioning(false);
    setWrongNode(null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    if (wrongTimer.current) clearTimeout(wrongTimer.current);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const fmtD = (v: number) => v === Infinity ? '∞' : String(v);
  const fmtP = (v: string | null) => v ?? '—';

  const statusMsg = (() => {
    if (phase === 'done') {
      return pathBuilt.length > 0
        ? `Shortest ${source}–${target} path: ${pathBuilt.join(' → ')} (distance ${dMap.get(target)})`
        : `No ${source}–${target} path exists.`;
    }
    if (phase === 'build-path')
      return `Click the predecessor of ${pathCurrent} to extend the path back toward ${source}.`;
    if (phase === 'update-edges') {
      return updateSet.size === 0
        ? `No distance updates from ${currentU}. Click 'Updates done' to continue.`
        : `Click neighbors of ${currentU} in U whose d(v) would improve. Click 'Updates done' when finished.`;
    }
    return `Select the next u (the vertex in U with the minimum d(v)).`;
  })();

  const canPrev = stepIndex > 0;
  const canNext = phase !== 'done';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      {isRandom && (
        <button onClick={newGraph}>
          New graph
        </button>
      )}
      <div style={{ position: 'relative' }}>
        <style>{`
          @keyframes dijkstra-toast {
            0%, 70% { opacity: 1; }
            100%     { opacity: 0; }
          }
          @keyframes dijkstra-path-glow {
            0%, 100% { filter: url(#${glowFilterId}); opacity: 1; }
            50%      { filter: url(#${glowFilterId}); opacity: 0.65; }
          }
          @keyframes dijkstra-shake {
            0%,100% { transform: translateX(0); }
            20%     { transform: translateX(-5px); }
            40%     { transform: translateX(5px); }
            60%     { transform: translateX(-5px); }
            80%     { transform: translateX(5px); }
          }
          .dijkstra-shake { animation: dijkstra-shake 0.4s ease; }
          .dijkstra-btn-error { animation: dijkstra-shake 0.4s ease; border-color: #dc2626 !important; color: #dc2626 !important; }
        `}</style>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: 'block', maxWidth: '100%', height: 'auto', color: 'var(--text)' }}
        >
          <defs>
            <marker id={markerId} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="currentColor" />
            </marker>
            <marker id={markerIdGreen} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#16a34a" />
            </marker>
            <filter id={glowFilterId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Edges */}
          {edgeGeom.map((g, i) => {
            const { x1, y1, x2, y2, mx, my, px, py, curveOffset, edge } = g;
            const { lx, ly } = labelPos(g);
            const { w: lw, h: lh } = labelSize(edge.weight, edgeWeightFontSize);
            const curved = curveOffset !== 0;
            const cpx = mx + px * curveOffset;
            const cpy = my + py * curveOffset;
            const onPath = highlightEdgeSet.has(`${edge.from},${edge.to}`);
            const stroke = onPath ? '#16a34a' : 'currentColor';
            const sw = onPath ? 3 : 1.5;
            const marker = `url(#${onPath ? markerIdGreen : markerId})`;
            return (
              <g key={i}>
                {curved ? (
                  <path
                    d={`M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`}
                    fill="none" stroke={stroke} strokeWidth={sw}
                    markerEnd={marker}
                  />
                ) : (
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={stroke} strokeWidth={sw}
                    markerEnd={marker}
                  />
                )}
                <rect x={lx - lw / 2} y={ly - lh / 2} width={lw} height={lh} fill="var(--bg)" />
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                  fontSize={edgeWeightFontSize} fill={stroke}>
                  {edge.weight}
                </text>
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const pos = posMap.get(node.id)!;
            const isWrong = wrongNode?.id === node.id;
            const base = nodeStyle(node.id);
            const { fill, stroke, text, sw, dim, glow } = isWrong
              ? { fill: '#fee2e2', stroke: '#dc2626', text: '#dc2626', sw: 2, dim: false, glow: false }
              : base;
            const inU = U.has(node.id);
            const clickable = phase === 'select-u' ? inU
              : phase === 'update-edges' || phase === 'build-path';
            return (
              <g
                key={isWrong ? `wrong-${wrongNode!.key}-${node.id}` : node.id}
                className={isWrong ? 'dijkstra-shake' : undefined}
                onClick={() => handleNodeClick(node.id)}
                style={{
                  cursor: clickable ? 'pointer' : 'default',
                  opacity: dim ? 0.35 : 1,
                  animation: glow ? 'dijkstra-path-glow 1.4s ease-in-out 3' : undefined,
                }}
              >
                <circle cx={pos.x} cy={pos.y} r={nodeRadius} fill={fill} stroke={stroke} strokeWidth={sw} />
                <text
                  x={pos.x} y={pos.y - nodeRadius * 0.22}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={labelFontSize} fill={text}
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {node.id}
                </text>
                <text
                  x={pos.x} y={pos.y + nodeRadius * 0.42}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={annotFontSize} fill={text}
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {fmtD(displayD.get(node.id)!)}, {fmtP(displayP.get(node.id)!)}
                </text>
              </g>
            );
          })}
        </svg>

        {toast && (
          <div
            key={toast.key}
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(15,15,15,0.82)', color: '#fff',
              padding: '8px 18px', borderRadius: '6px',
              fontSize: '0.85em', maxWidth: '80%', textAlign: 'center',
              pointerEvents: 'none',
              animation: 'dijkstra-toast 2.5s ease forwards',
            }}
          >
            {toast.msg}
          </div>
        )}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={goPrev}
          disabled={!canPrev}
        >
          ← Prev
        </button>
        <button
          ref={updatesDoneBtnRef}
          onClick={phase === 'done' ? reset : handleUpdatesDone}
          style={{ visibility: phase === 'update-edges' || phase === 'done' ? 'visible' : 'hidden' }}
        >
          {phase === 'done' ? 'Reset' : 'Updates done'}
        </button>
        <button
          onClick={goNext}
          disabled={!canNext}
        >
          Next →
        </button>
      </div>

      {/* Status */}
      <div style={{
        fontSize: '0.9em',
        color: phase === 'done' && pathBuilt.length > 0 ? '#16a34a' : 'var(--text-muted)',
        fontWeight: phase === 'done' ? 600 : 400,
        textAlign: 'center',
      }}>
        {statusMsg}
      </div>

      {/* Tracking table */}
      <div style={{ overflowX: 'auto', maxWidth: `${width}px`, width: '100%' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.82em', margin: '0 auto' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, borderRight: '3px solid var(--text-muted)' }}><em>u</em></th>
              {nodes.map(n => <th key={n.id} style={thStyle}>{n.id}</th>)}
            </tr>
          </thead>
          <tbody>
            {history.map((rec, row) => (
              <tr key={row}>
                <td style={{ ...tdBase, fontStyle: 'italic', borderRight: '3px solid var(--text-muted)' }}>{rec.u ?? '—'}</td>
                {nodes.map(n => {
                  const dv = rec.d.get(n.id)!;
                  const pv = rec.p.get(n.id) ?? null;
                  const changed = row > 0 && (
                    history[row - 1].d.get(n.id) !== dv ||
                    history[row - 1].p.get(n.id) !== pv
                  );
                  return (
                    <td key={n.id} style={{
                      ...tdBase,
                      fontWeight: changed ? 700 : 400,
                      background: changed ? 'rgba(37,99,235,0.08)' : undefined,
                    }}>
                      {fmtD(dv)}, {fmtP(pv)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
