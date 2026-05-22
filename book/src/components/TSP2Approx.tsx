import { useState, useMemo, useEffect, useRef, useId } from 'react';
import {
  computeEdgeGeom, toSvg, edgeKey,
  labelPos, labelSize, thStyle, tdBase,
} from './primAlgoUtils';
import { usePrimPhase } from './usePrimPhase';
import { PrimPhaseCanvas } from './PrimPhaseCanvas';

// ── Types ─────────────────────────────────────────────────────────────────────

type TraversalStep = { from: string; to: string; backtrack: boolean };

type TravSnap = {
  steps: TraversalStep[];
  currentNode: string;
  parentStack: string[];
  visited: Set<string>;
  done: boolean;
};

// scanHistory[i]: what happened when the scan cursor visited scanSeq[i]
type ScanAction = 'added' | 'skipped';

type TourSnap = {
  scanIdx: number;           // highest index in scanSeq processed so far
  tourHead: string;          // last node appended to the tour
  tourEdgeKeys: Set<string>; // tour edges built so far
  tourVisited: Set<string>;  // nodes placed in the tour
  scanHistory: ScanAction[]; // length = scanIdx + 1
  done: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TRAV_CURVE = 25;

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  width?: number;
  height?: number;
  nodeRadius?: number;
  labelFontSize?: number;
  edgeWeightFontSize?: number;
  density?: number;
}

type OverallPhase = 'prim' | 'traversal' | 'tour';

export function TSP2Approx({
  width = 520,
  height = 340,
  nodeRadius = 22,
  labelFontSize = 18,
  edgeWeightFontSize = 14,
  density = 1,
}: Props) {
  const uid = useId().replace(/:/g, '');
  const fwdId = `tsp-fwd-${uid}`;
  const bckId = `tsp-bck-${uid}`;
  const glowId = `tsp-glow-${uid}`;

  // ── Prim phase ────────────────────────────────────────────────────────────

  const prim = usePrimPhase(density);
  const { graph, snap: primSnap, stepIndex: primStepIdx,
          handleEdgeClick, goPrev: primGoPrev, goNext: primGoNext,
          reset: primReset, newGraph: primNewGraph, toast, wrongEdge } = prim;
  const { nodes, edges, root } = graph;
  const { phase: primPhase, U, T, history } = primSnap;

  // ── Overall phase ─────────────────────────────────────────────────────────

  const [overallPhase, setOverallPhase] = useState<OverallPhase>('prim');

  // ── Traversal state ───────────────────────────────────────────────────────

  const [finalMst, setFinalMst] = useState<Set<string>>(new Set());
  const [travSnaps, setTravSnaps] = useState<TravSnap[]>([]);
  const [travIdx, setTravIdx] = useState(0);
  const travSnap = travSnaps[travIdx] ?? null;

  const [travToast, setTravToast] = useState<{ msg: string; key: number } | null>(null);
  const travToastRef = useRef<ReturnType<typeof setTimeout>>();
  const [wrongNode, setWrongNode] = useState<{ id: string; key: number } | null>(null);
  const wrongNodeRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Tour state ────────────────────────────────────────────────────────────

  // scanSeq = [root, step0.to, step1.to, ...] – the full traversal node sequence
  const [scanSeq, setScanSeq] = useState<string[]>([]);
  const [tourSnaps, setTourSnaps] = useState<TourSnap[]>([]);
  const [tourIdx, setTourIdx] = useState(0);
  const tourSnap = tourSnaps[tourIdx] ?? null;

  const [tourToast, setTourToast] = useState<{ msg: string; key: number } | null>(null);
  const tourToastRef = useRef<ReturnType<typeof setTimeout>>();
  const [wrongTourNode, setWrongTourNode] = useState<{ id: string; key: number } | null>(null);
  const wrongTourRef = useRef<ReturnType<typeof setTimeout>>();
  const [optimalCost, setOptimalCost] = useState<number | null>(null);

  // ── Geometry ──────────────────────────────────────────────────────────────

  const pad = nodeRadius + 6;
  const posMap = useMemo(
    () => new Map(nodes.map(n => [n.id, toSvg(n.x, n.y, width, height, pad)])),
    [nodes, width, height, pad],
  );
  const edgeGeom = useMemo(
    () => computeEdgeGeom(edges, posMap, nodeRadius, edgeWeightFontSize),
    [edges, posMap, nodeRadius, edgeWeightFontSize],
  );
  const geomMap = useMemo(
    () => new Map(edgeGeom.map(g => [edgeKey(g.edge.u, g.edge.v), g])),
    [edgeGeom],
  );

  // ── MST adjacency for traversal phase ────────────────────────────────────

  const mstAdj = useMemo(() => {
    const adj = new Map<string, string[]>(nodes.map(n => [n.id, []]));
    for (const k of finalMst) {
      const [u, v] = k.split(',');
      adj.get(u)?.push(v); adj.get(v)?.push(u);
    }
    for (const [, ns] of adj) ns.sort();
    return adj;
  }, [finalMst, nodes]);

  // ── Reset on new graph ────────────────────────────────────────────────────

  useEffect(() => {
    setOverallPhase('prim');
    setFinalMst(new Set()); setTravSnaps([]); setTravIdx(0);
    setScanSeq([]); setTourSnaps([]); setTourIdx(0);
    setOptimalCost(null);
  }, [graph]);

  useEffect(() => () => {
    if (travToastRef.current) clearTimeout(travToastRef.current);
    if (wrongNodeRef.current) clearTimeout(wrongNodeRef.current);
    if (tourToastRef.current) clearTimeout(tourToastRef.current);
    if (wrongTourRef.current) clearTimeout(wrongTourRef.current);
  }, []);

  // ── Traversal helpers ─────────────────────────────────────────────────────

  function showTravToast(msg: string) {
    if (travToastRef.current) clearTimeout(travToastRef.current);
    setTravToast(t => ({ msg, key: (t?.key ?? 0) + 1 }));
    travToastRef.current = setTimeout(() => setTravToast(null), 2800);
  }

  function flashWrongNode(id: string) {
    if (wrongNodeRef.current) clearTimeout(wrongNodeRef.current);
    setWrongNode(w => ({ id, key: (w?.key ?? 0) + 1 }));
    wrongNodeRef.current = setTimeout(() => setWrongNode(null), 900);
  }

  function pushTravSnap(s: TravSnap) {
    setTravSnaps(prev => [...prev.slice(0, travIdx + 1), s]);
    setTravIdx(i => i + 1);
  }

  function getUnvisited(snap: TravSnap) {
    return (mstAdj.get(snap.currentNode) ?? []).filter(n => !snap.visited.has(n));
  }

  function applyForward(snap: TravSnap, neighbor: string): TravSnap {
    const newVisited = new Set(snap.visited);
    newVisited.add(neighbor);
    return {
      steps: [...snap.steps, { from: snap.currentNode, to: neighbor, backtrack: false }],
      currentNode: neighbor,
      parentStack: [...snap.parentStack, snap.currentNode],
      visited: newVisited,
      done: false,
    };
  }

  function applyBacktrack(snap: TravSnap): TravSnap {
    const parent = snap.parentStack[snap.parentStack.length - 1];
    const newStack = snap.parentStack.slice(0, -1);
    const done = newStack.length === 0 && snap.visited.size === nodes.length;
    return {
      steps: [...snap.steps, { from: snap.currentNode, to: parent, backtrack: true }],
      currentNode: parent,
      parentStack: newStack,
      visited: snap.visited,
      done,
    };
  }

  // ── Optimal TSP (brute force, feasible for 6 nodes) ──────────────────────

  function computeOptimalCost(): number {
    const wt = new Map<string, number>();
    for (const e of edges) wt.set(edgeKey(e.u, e.v), e.weight);
    const getW = (a: string, b: string) => wt.get(edgeKey(a, b)) ?? Infinity;
    const ids = nodes.map(n => n.id);
    const others = ids.filter(id => id !== root);

    function permute(arr: string[]): string[][] {
      if (arr.length <= 1) return [arr];
      return arr.flatMap((x, i) =>
        permute([...arr.slice(0, i), ...arr.slice(i + 1)]).map(p => [x, ...p]));
    }

    let best = Infinity;
    for (const perm of permute(others)) {
      const tour = [root, ...perm, root];
      let cost = 0;
      for (let i = 0; i < tour.length - 1; i++) cost += getW(tour[i], tour[i + 1]);
      if (cost < best) best = cost;
    }
    return best;
  }

  // ── Tour helpers ──────────────────────────────────────────────────────────

  function showTourToast(msg: string) {
    if (tourToastRef.current) clearTimeout(tourToastRef.current);
    setTourToast(t => ({ msg, key: (t?.key ?? 0) + 1 }));
    tourToastRef.current = setTimeout(() => setTourToast(null), 2800);
  }

  function flashWrongTourNode(id: string) {
    if (wrongTourRef.current) clearTimeout(wrongTourRef.current);
    setWrongTourNode(w => ({ id, key: (w?.key ?? 0) + 1 }));
    wrongTourRef.current = setTimeout(() => setWrongTourNode(null), 900);
  }

  function pushTourSnap(s: TourSnap) {
    setTourSnaps(prev => [...prev.slice(0, tourIdx + 1), s]);
    setTourIdx(i => i + 1);
  }

  // Returns the index in scanSeq of the next node to be added to the tour
  function getNextAddIdx(snap: TourSnap): number | null {
    for (let i = snap.scanIdx + 1; i < scanSeq.length; i++) {
      const isLast = i === scanSeq.length - 1;
      if (!snap.tourVisited.has(scanSeq[i]) || isLast) return i;
    }
    return null;
  }

  // Fast-forward the scan cursor through any skips to land on the next add
  function advanceToNextTourNode(snap: TourSnap): TourSnap {
    let current = snap;
    while (!current.done && current.scanIdx < scanSeq.length - 1) {
      const nextIdx = current.scanIdx + 1;
      const nextNode = scanSeq[nextIdx];
      const isLast = nextIdx === scanSeq.length - 1;
      const isAdd = !current.tourVisited.has(nextNode) || isLast;
      const newHistory = [...current.scanHistory, isAdd ? 'added' : 'skipped'] as ScanAction[];
      if (isAdd) {
        const newEdgeKeys = new Set(current.tourEdgeKeys);
        newEdgeKeys.add(edgeKey(current.tourHead, nextNode));
        const newVisited = new Set(current.tourVisited);
        newVisited.add(nextNode);
        return { scanIdx: nextIdx, tourHead: nextNode, tourEdgeKeys: newEdgeKeys, tourVisited: newVisited, scanHistory: newHistory, done: isLast };
      }
      current = { ...current, scanIdx: nextIdx, scanHistory: newHistory };
    }
    return current;
  }

  // ── Phase transitions ─────────────────────────────────────────────────────

  function enterTraversalPhase() {
    const mst = new Set(T);
    setFinalMst(mst);
    setTravSnaps([{ steps: [], currentNode: root, parentStack: [], visited: new Set([root]), done: false }]);
    setTravIdx(0);
    setOverallPhase('traversal');
  }

  function enterTourPhase(snap: TravSnap) {
    const seq = [root, ...snap.steps.map(s => s.to)];
    setScanSeq(seq);
    setTourSnaps([{
      scanIdx: 0,
      tourHead: root,
      tourEdgeKeys: new Set(),
      tourVisited: new Set([root]),
      scanHistory: ['added'],
      done: seq.length <= 1,
    }]);
    setTourIdx(0);
    setOptimalCost(computeOptimalCost());
    setOverallPhase('tour');
  }

  // ── Click handlers ────────────────────────────────────────────────────────

  function handleTravNodeClick(nodeId: string) {
    if (!travSnap || travSnap.done) return;
    const unvisited = getUnvisited(travSnap);
    if (unvisited.length > 0) {
      if (unvisited.includes(nodeId)) {
        pushTravSnap(applyForward(travSnap, nodeId));
      } else {
        const parent = travSnap.parentStack[travSnap.parentStack.length - 1];
        if (nodeId === parent) showTravToast(`Visit all neighbors first: {${unvisited.join(', ')}}`);
        else if (travSnap.visited.has(nodeId)) showTravToast(`${nodeId} is already visited`);
        else showTravToast(`${nodeId} is not an MST neighbor of ${travSnap.currentNode}`);
        flashWrongNode(nodeId);
      }
    } else {
      const parent = travSnap.parentStack[travSnap.parentStack.length - 1];
      if (parent === undefined) return;
      if (nodeId === parent) pushTravSnap(applyBacktrack(travSnap));
      else { showTravToast(`Backtrack to ${parent}`); flashWrongNode(nodeId); }
    }
  }

  function handleTourNodeClick(nodeId: string) {
    if (!tourSnap || tourSnap.done) return;
    const addIdx = getNextAddIdx(tourSnap);
    if (addIdx === null) return;
    if (nodeId === scanSeq[addIdx]) {
      pushTourSnap(advanceToNextTourNode(tourSnap));
    } else {
      if (tourSnap.tourVisited.has(nodeId) && nodeId !== root) {
        showTourToast(`${nodeId} is already in the tour`);
      } else {
        showTourToast('Find the next unvisited node in the traversal sequence and click it');
      }
      flashWrongTourNode(nodeId);
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function goNext() {
    if (overallPhase === 'prim') {
      if (primPhase === 'done') enterTraversalPhase();
      else primGoNext();
    } else if (overallPhase === 'traversal' && travSnap) {
      if (travSnap.done) { enterTourPhase(travSnap); }
      else {
        const unvisited = getUnvisited(travSnap);
        if (unvisited.length > 0) pushTravSnap(applyForward(travSnap, unvisited[0]));
        else if (travSnap.parentStack.length > 0) pushTravSnap(applyBacktrack(travSnap));
      }
    } else if (overallPhase === 'tour' && tourSnap && !tourSnap.done) {
      pushTourSnap(advanceToNextTourNode(tourSnap));
    }
  }

  function goPrev() {
    if (overallPhase === 'prim') { primGoPrev(); }
    else if (overallPhase === 'traversal') {
      if (travIdx === 0) setOverallPhase('prim');
      else setTravIdx(i => i - 1);
    } else {
      if (tourIdx === 0) setOverallPhase('traversal');
      else setTourIdx(i => i - 1);
    }
  }

  function resetAll() {
    if (travToastRef.current) clearTimeout(travToastRef.current);
    if (wrongNodeRef.current) clearTimeout(wrongNodeRef.current);
    if (tourToastRef.current) clearTimeout(tourToastRef.current);
    if (wrongTourRef.current) clearTimeout(wrongTourRef.current);
    primReset();
    setOverallPhase('prim');
    setFinalMst(new Set()); setTravSnaps([]); setTravIdx(0);
    setScanSeq([]); setTourSnaps([]); setTourIdx(0);
    setTravToast(null); setWrongNode(null);
    setTourToast(null); setWrongTourNode(null);
    setOptimalCost(null);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const atStart = overallPhase === 'prim' && primStepIdx === 0;
  const isInPrimDone = overallPhase === 'prim' && primPhase === 'done';
  const travDone = overallPhase === 'traversal' && !!travSnap?.done;
  const tourDone = overallPhase === 'tour' && !!tourSnap?.done;
  const showReset = isInPrimDone || tourDone;
  const nextDisabled = tourDone;

  // ── Node visuals ──────────────────────────────────────────────────────────

  function travNodeVis(nodeId: string) {
    const isWrong = wrongNode?.id === nodeId;
    if (isWrong) return { fill: '#fee2e2', stroke: '#dc2626', text: '#dc2626', sw: 2.5, cursor: 'default' as const };
    if (!travSnap || travSnap.done) return { fill: '#bbf7d0', stroke: '#16a34a', text: '#16a34a', sw: 2.5, cursor: 'default' as const };
    const isCurrent = nodeId === travSnap.currentNode;
    const unvisited = getUnvisited(travSnap);
    const parent = travSnap.parentStack[travSnap.parentStack.length - 1];
    const clickable = unvisited.length > 0 ? unvisited.includes(nodeId) : nodeId === parent;
    if (isCurrent) return { fill: '#fef3c7', stroke: '#d97706', text: '#92400e', sw: 2.5, cursor: 'default' as const };
    if (clickable) return { fill: '#dbeafe', stroke: '#2563eb', text: '#1e3a8a', sw: 2.5, cursor: 'pointer' as const };
    if (travSnap.visited.has(nodeId)) return { fill: '#dbeafe', stroke: '#2563eb', text: '#1e3a8a', sw: 1.5, cursor: 'default' as const };
    return { fill: 'var(--bg)', stroke: 'currentColor', text: 'currentColor', sw: 1.5, cursor: 'default' as const };
  }

  function tourNodeVis(nodeId: string) {
    const isWrong = wrongTourNode?.id === nodeId;
    if (isWrong) return { fill: '#fee2e2', stroke: '#dc2626', text: '#dc2626', sw: 2.5, cursor: 'default' as const };
    if (!tourSnap || tourSnap.done) return { fill: '#bbf7d0', stroke: '#16a34a', text: '#16a34a', sw: 2.5, cursor: 'default' as const };
    const inTour = tourSnap.tourVisited.has(nodeId);
    if (inTour) return { fill: '#dbeafe', stroke: '#2563eb', text: '#1e3a8a', sw: 1.5, cursor: 'default' as const };
    return { fill: 'var(--bg)', stroke: 'currentColor', text: 'currentColor', sw: 1.5, cursor: 'pointer' as const };
  }

  // ── Status & labels ───────────────────────────────────────────────────────

  function mstWeight() {
    return [...T].reduce((s, k) => {
      const e = edges.find(e => edgeKey(e.u, e.v) === k);
      return s + (e?.weight ?? 0);
    }, 0);
  }

  function tourCost() {
    if (!tourSnap) return 0;
    let cost = 0;
    for (const k of tourSnap.tourEdgeKeys) {
      const e = edges.find(e => edgeKey(e.u, e.v) === k);
      if (e) cost += e.weight;
    }
    return cost;
  }

  function statusMsg() {
    if (overallPhase === 'prim') {
      if (primPhase === 'done') return `MST complete (weight ${mstWeight()}). Press Next → to build the traversal.`;
      return 'Click the minimum-cost edge with one endpoint in the tree (blue) and one outside.';
    }
    if (overallPhase === 'traversal' && travSnap) {
      if (travSnap.done) return 'Traversal complete. Press Next → to build the shortcut tour.';
      const unvisited = getUnvisited(travSnap);
      if (unvisited.length > 0) return `At node ${travSnap.currentNode}. Click a neighbor: {${unvisited.join(', ')}}`;
      const parent = travSnap.parentStack[travSnap.parentStack.length - 1];
      return `All neighbors explored. Click ${parent} or press Next → to backtrack.`;
    }
    if (overallPhase === 'tour' && tourSnap) {
      if (tourSnap.done) return `Tour complete! Tour cost: ${tourCost()}. Optimal cost: ${optimalCost ?? '…'}.`;
      const addIdx = getNextAddIdx(tourSnap);
      if (addIdx === null) return '';
      const isReturn = addIdx === scanSeq.length - 1;
      return isReturn
        ? 'Find the next unvisited node in the traversal and click it to close the tour.'
        : 'Find the next unvisited node in the traversal and click it on the graph.';
    }
    return '';
  }

  function travPathStr() {
    if (!travSnap || travSnap.steps.length === 0) return root;
    return [root, ...travSnap.steps.map(s => s.to)].join(' → ');
  }

  function tourPathStr() {
    if (!tourSnap) return '';
    const added: string[] = [];
    for (let i = 0; i < tourSnap.scanHistory.length; i++) {
      if (tourSnap.scanHistory[i] === 'added') added.push(scanSeq[i]);
    }
    return added.join(' → ');
  }

  // Status of a position in the scan sequence display
  function scanStatus(i: number): 'root' | 'added' | 'skipped' | 'current' | 'pending' {
    if (!tourSnap) return 'pending';
    if (i === 0) return 'root';
    if (i <= tourSnap.scanIdx) return tourSnap.scanHistory[i];
    return 'pending';
  }

  // ── Traversal SVG ─────────────────────────────────────────────────────────

  function renderTraversalSvg() {
    if (!travSnap) return null;
    const visible = travSnap.steps;
    const touchedKeys = new Set(visible.map(s => [s.from, s.to].sort().join(',')));
    const untouchedMst = [...finalMst].filter(k => !touchedKeys.has(k));

    return (
      <div style={{ position: 'relative' }}>
        <style>{`
          @keyframes tsp-toast { 0%,70%{opacity:1} 100%{opacity:0} }
          @keyframes tsp-shake {
            0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)}
            40%{transform:translateX(4px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)}
          }
          .tsp-shake { animation: tsp-shake 0.4s ease; }
        `}</style>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
          style={{ display: 'block', maxWidth: '100%', height: 'auto', color: 'var(--text)' }}>
          <defs>
            <marker id={fwdId} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#2563eb" />
            </marker>
            <marker id={bckId} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#9ca3af" />
            </marker>
          </defs>

          {edgeGeom.map(g => {
            const k = edgeKey(g.edge.u, g.edge.v);
            if (finalMst.has(k)) return null;
            const { x1, y1, x2, y2, mx, my, px, py, curveOffset } = g;
            const cpx = mx + px * curveOffset, cpy = my + py * curveOffset;
            return curveOffset !== 0
              ? <path key={k} d={`M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`} fill="none" stroke="currentColor" strokeWidth={1} opacity={0.2} />
              : <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={1} opacity={0.2} />;
          })}

          {untouchedMst.map(k => {
            const g = geomMap.get(k);
            if (!g) return null;
            return <line key={`mst-${k}`} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="#2563eb" strokeWidth={2} />;
          })}

          {visible.map((step, i) => {
            const k = edgeKey(step.from, step.to);
            const g = geomMap.get(k)!;
            const side = step.backtrack ? -1 : 1;
            const cpx = g.mx + g.px * TRAV_CURVE * side;
            const cpy = g.my + g.py * TRAV_CURVE * side;
            const sp = posMap.get(step.from)!, tp = posMap.get(step.to)!;
            const dx = tp.x - sp.x, dy = tp.y - sp.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / len, uy = dy / len;
            return (
              <path key={`trav-${i}`}
                d={`M ${sp.x + ux * nodeRadius} ${sp.y + uy * nodeRadius} Q ${cpx} ${cpy} ${tp.x - ux * nodeRadius} ${tp.y - uy * nodeRadius}`}
                fill="none" stroke={step.backtrack ? '#9ca3af' : '#2563eb'} strokeWidth={2.5}
                markerEnd={`url(#${step.backtrack ? bckId : fwdId})`} />
            );
          })}

          {nodes.map(node => {
            const pos = posMap.get(node.id)!;
            const vis = travNodeVis(node.id);
            const isWrong = wrongNode?.id === node.id;
            return (
              <g key={isWrong ? `w-${wrongNode!.key}-${node.id}` : node.id}
                onClick={() => handleTravNodeClick(node.id)}
                style={{ cursor: vis.cursor }}
                className={isWrong ? 'tsp-shake' : undefined}>
                <circle cx={pos.x} cy={pos.y} r={nodeRadius + (vis.cursor === 'pointer' ? 4 : 0)} fill="transparent" stroke="none" />
                <circle cx={pos.x} cy={pos.y} r={nodeRadius} fill={vis.fill} stroke={vis.stroke} strokeWidth={vis.sw} />
                <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="middle"
                  fontSize={labelFontSize} fill={vis.text} style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {node.id}
                </text>
              </g>
            );
          })}

          {edgeGeom.filter(g => finalMst.has(edgeKey(g.edge.u, g.edge.v))).map(g => {
            const k = edgeKey(g.edge.u, g.edge.v);
            const { lx, ly } = labelPos(g);
            const { w: lw, h: lh } = labelSize(g.edge.weight, edgeWeightFontSize);
            return (
              <g key={`lbl-${k}`} style={{ pointerEvents: 'none' }}>
                <rect x={lx - lw / 2} y={ly - lh / 2} width={lw} height={lh} fill="var(--bg)" />
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                  fontSize={edgeWeightFontSize} fill="#2563eb" style={{ userSelect: 'none' }}>
                  {g.edge.weight}
                </text>
              </g>
            );
          })}
        </svg>

        {travToast && (
          <div key={travToast.key} style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'rgba(15,15,15,0.82)', color: '#fff', padding: '8px 18px', borderRadius: '6px',
            fontSize: '0.85em', maxWidth: '80%', textAlign: 'center',
            pointerEvents: 'none', animation: 'tsp-toast 2.8s ease forwards',
          }}>
            {travToast.msg}
          </div>
        )}
      </div>
    );
  }

  // ── Tour SVG ──────────────────────────────────────────────────────────────

  function renderTourSvg() {
    if (!tourSnap) return null;
    const tourKeys = tourSnap.tourEdgeKeys;

    return (
      <div style={{ position: 'relative' }}>
        <style>{`
          @keyframes tsp-toast { 0%,70%{opacity:1} 100%{opacity:0} }
          @keyframes tsp-shake {
            0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)}
            40%{transform:translateX(4px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)}
          }
          .tsp-shake { animation: tsp-shake 0.4s ease; }
        `}</style>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
          style={{ display: 'block', maxWidth: '100%', height: 'auto', color: 'var(--text)' }}>
          <defs>
            <filter id={glowId} x={-12} y={-12} width={width + 24} height={height + 24} filterUnits="userSpaceOnUse">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {edgeGeom.map(g => {
            const k = edgeKey(g.edge.u, g.edge.v);
            const inTour = tourKeys.has(k);
            const { x1, y1, x2, y2, mx, my, px, py, curveOffset } = g;
            const cpx = mx + px * curveOffset, cpy = my + py * curveOffset;
            return (
              <g key={k} filter={inTour && tourDone ? `url(#${glowId})` : undefined}>
                {curveOffset !== 0
                  ? <path d={`M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`} fill="none"
                      stroke={inTour ? '#16a34a' : 'currentColor'} strokeWidth={inTour ? 3.5 : 1.5} opacity={inTour ? 1 : tourDone ? 1 : 0.3} />
                  : <line x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={inTour ? '#16a34a' : 'currentColor'} strokeWidth={inTour ? 3.5 : 1.5} opacity={inTour ? 1 : tourDone ? 1 : 0.3} />}
              </g>
            );
          })}

          {nodes.map(node => {
            const pos = posMap.get(node.id)!;
            const vis = tourNodeVis(node.id);
            const isWrong = wrongTourNode?.id === node.id;
            return (
              <g key={isWrong ? `w-${wrongTourNode!.key}-${node.id}` : node.id}
                onClick={() => handleTourNodeClick(node.id)}
                style={{ cursor: vis.cursor }}
                className={isWrong ? 'tsp-shake' : undefined}>
                <circle cx={pos.x} cy={pos.y} r={nodeRadius + (vis.cursor === 'pointer' ? 4 : 0)} fill="transparent" stroke="none" />
                <circle cx={pos.x} cy={pos.y} r={nodeRadius} fill={vis.fill} stroke={vis.stroke} strokeWidth={vis.sw} />
                <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="middle"
                  fontSize={labelFontSize} fill={vis.text} style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {node.id}
                </text>
              </g>
            );
          })}

          {edgeGeom.map(g => {
            const k = edgeKey(g.edge.u, g.edge.v);
            const inTour = tourKeys.has(k);
            const { lx, ly } = labelPos(g);
            const { w: lw, h: lh } = labelSize(g.edge.weight, edgeWeightFontSize);
            return (
              <g key={`lbl-${k}`} style={{ pointerEvents: 'none' }}>
                <rect x={lx - lw / 2} y={ly - lh / 2} width={lw} height={lh} fill="var(--bg)" />
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                  fontSize={edgeWeightFontSize}
                  fill={inTour ? '#16a34a' : 'currentColor'}
                  opacity={inTour ? 1 : tourDone ? 1 : 0.4}
                  style={{ userSelect: 'none' }}>
                  {g.edge.weight}
                </text>
              </g>
            );
          })}
        </svg>

        {tourToast && (
          <div key={tourToast.key} style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'rgba(15,15,15,0.82)', color: '#fff', padding: '8px 18px', borderRadius: '6px',
            fontSize: '0.85em', maxWidth: '80%', textAlign: 'center',
            pointerEvents: 'none', animation: 'tsp-toast 2.8s ease forwards',
          }}>
            {tourToast.msg}
          </div>
        )}
      </div>
    );
  }

  // ── Scan sequence display ─────────────────────────────────────────────────

  function renderScanSeq() {
    if (overallPhase !== 'tour' || !tourSnap || scanSeq.length === 0) return null;
    return (
      <div style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
        gap: '2px', maxWidth: `${width}px`, fontFamily: 'monospace', fontSize: '0.88em',
      }}>
        {scanSeq.map((node, i) => {
          const st = scanStatus(i);
          const color = st === 'added' || st === 'root' ? '#2563eb'
            : st === 'skipped' ? '#9ca3af'
            : 'var(--text-muted)';
          return (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
              {i > 0 && <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>→</span>}
              <span style={{
                color,
                fontWeight: st === 'added' || st === 'root' ? 600 : 400,
                textDecoration: st === 'skipped' ? 'line-through' : 'none',
                borderRadius: '3px',
                padding: '0 3px',
              }}>
                {node}
              </span>
            </span>
          );
        })}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const phaseLabel = overallPhase === 'prim' ? 'Step 1: Build MST'
    : overallPhase === 'traversal' ? 'Step 2: Tree traversal'
    : 'Step 3: Shortcut tour';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button onClick={primNewGraph}>New graph</button>
        <span style={{ fontSize: '0.85em', color: 'var(--text-muted)', fontStyle: 'italic' }}>{phaseLabel}</span>
      </div>

      {overallPhase === 'prim' && (
        <PrimPhaseCanvas
          nodes={nodes} posMap={posMap} edgeGeom={edgeGeom}
          U={U} T={T} phase={primPhase}
          wrongEdge={wrongEdge} toast={toast}
          onEdgeClick={handleEdgeClick}
          width={width} height={height}
          nodeRadius={nodeRadius} labelFontSize={labelFontSize}
          edgeWeightFontSize={edgeWeightFontSize}
        />
      )}
      {overallPhase === 'traversal' && renderTraversalSvg()}
      {overallPhase === 'tour' && renderTourSvg()}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={goPrev} disabled={atStart}>← Prev</button>
        <button onClick={showReset ? resetAll : () => {}} style={{ visibility: showReset ? 'visible' : 'hidden' }}>Reset</button>
        <button onClick={goNext} disabled={nextDisabled}>Next →</button>
      </div>

      <div style={{
        fontSize: '0.9em', textAlign: 'center', maxWidth: `${width}px`,
        color: (tourDone || isInPrimDone || travDone) ? '#16a34a' : 'var(--text-muted)',
        fontWeight: (tourDone || isInPrimDone || travDone) ? 600 : 400,
      }}>
        {statusMsg()}
      </div>

      {/* Traversal path */}
      {overallPhase === 'traversal' && travSnap && (
        <div style={{
          fontFamily: 'monospace', fontSize: '0.95em', minHeight: '1.4em',
          textAlign: 'center', maxWidth: `${width}px`,
          color: travSnap.done ? '#16a34a' : 'currentColor',
          fontWeight: travSnap.done ? 600 : 400,
        }}>
          {travPathStr()}
        </div>
      )}

      {/* Traversal scan sequence (tour phase) */}
      {renderScanSeq()}

      {/* Tour path */}
      {overallPhase === 'tour' && tourSnap && tourSnap.scanIdx > 0 && (
        <div style={{
          fontFamily: 'monospace', fontSize: '0.95em', minHeight: '1.4em',
          textAlign: 'center', maxWidth: `${width}px`,
          color: tourDone ? '#16a34a' : 'currentColor',
          fontWeight: tourDone ? 600 : 400,
        }}>
          {tourPathStr()}
        </div>
      )}

      {overallPhase === 'prim' && (
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
                  <td style={tdBase}>{rec.addedEdge ? `(${[rec.addedEdge.u, rec.addedEdge.v].sort().join(', ')})` : '—'}</td>
                  <td style={{ ...tdBase, borderRight: '3px solid var(--text-muted)' }}>{rec.addedEdge?.weight ?? '—'}</td>
                  <td style={tdBase}>{`{${rec.U.join(', ')}}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
