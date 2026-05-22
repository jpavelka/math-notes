import { useState, useRef, useEffect } from 'react';
import {
  type Node, type UEdge, type Snapshot, type Phase,
  edgeKey, makeInitSnapshot, makeRandomGraph,
} from './primAlgoUtils';

export type { Node, UEdge, Snapshot };
export type PrimGraph = { nodes: Node[]; edges: UEdge[]; root: string };

export function usePrimPhase(density: number) {
  const [graph, setGraph] = useState<PrimGraph>(() => makeRandomGraph(density));
  const { nodes, edges, root } = graph;

  const [snapshots, setSnapshots] = useState<Snapshot[]>(() => [makeInitSnapshot(root, nodes.length)]);
  const [stepIndex, setStepIndex] = useState(0);

  const snap = snapshots[stepIndex];
  const { phase, U, T, history } = snap;

  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const [wrongEdge, setWrongEdge] = useState<{ edgeId: string; animKey: number } | null>(null);
  const wrongTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (wrongTimer.current) clearTimeout(wrongTimer.current);
  }, []);

  function clearTimers() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (wrongTimer.current) clearTimeout(wrongTimer.current);
  }

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

  function pushSnap(s: Snapshot) {
    setSnapshots(prev => [...prev.slice(0, stepIndex + 1), s]);
    setStepIndex(i => i + 1);
  }

  function cutEdges() {
    return edges.filter(e => {
      const uIn = U.has(e.u), vIn = U.has(e.v);
      return (uIn && !vIn) || (!uIn && vIn);
    });
  }

  function applyAddEdge(edge: UEdge) {
    const newU = new Set(U);
    const newT = new Set(T);
    newU.add(U.has(edge.u) ? edge.v : edge.u);
    newT.add(edgeKey(edge.u, edge.v));
    const sortedU = [...newU].sort();
    const newPhase: Phase = newU.size === nodes.length ? 'done' : 'select-edge';
    pushSnap({
      phase: newPhase,
      U: newU, T: newT,
      history: [...history, { addedEdge: edge, U: sortedU }],
    });
  }

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

  function goPrev() { if (stepIndex > 0) setStepIndex(i => i - 1); }

  function goNext() {
    if (phase !== 'select-edge') return;
    const cut = cutEdges();
    if (!cut.length) return;
    const minW = Math.min(...cut.map(e => e.weight));
    applyAddEdge(cut.find(e => e.weight === minW)!);
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

  return {
    graph,
    snap,
    stepIndex,
    handleEdgeClick,
    goPrev,
    goNext,
    reset,
    newGraph,
    toast,
    wrongEdge,
  };
}
