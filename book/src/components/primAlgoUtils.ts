import type { CSSProperties } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Node = { id: string; x: number; y: number };
export type UEdge = { u: string; v: string; weight: number };

export type EdgeGeom = {
  edge: UEdge;
  x1: number; y1: number; x2: number; y2: number;
  px: number; py: number;
  mx: number; my: number;
  curveOffset: number;
};

export type Phase = 'select-edge' | 'done';
export type IterRecord = { addedEdge: UEdge | null; U: string[] };
export type Snapshot = { phase: Phase; U: Set<string>; T: Set<string>; history: IterRecord[] };

// ── Utilities ─────────────────────────────────────────────────────────────────

export function edgeKey(a: string, b: string) { return a < b ? `${a},${b}` : `${b},${a}`; }
export function randInt(lo: number, hi: number) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }

// ── Random graph ─────────────────────────────────────────────────────────────

export const GROUPS = [['a', 'b'], ['c', 'd'], ['e', 'f']] as const;

export const POSITIONS: Record<string, { x: number; y: number }> = {
  a: { x: 0.05, y: 0.75 }, b: { x: 0.05, y: 0.25 },
  c: { x: 0.50, y: 0.92 }, d: { x: 0.50, y: 0.08 },
  e: { x: 0.95, y: 0.75 }, f: { x: 0.95, y: 0.25 },
};

export function makeRandomGraph(_density = 1): { nodes: Node[]; edges: UEdge[]; root: string } {
  const ids = GROUPS.flat() as string[];
  const nodes: Node[] = ids.map(id => ({ id, ...POSITIONS[id] }));
  const edges: UEdge[] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      edges.push({ u: ids[i], v: ids[j], weight: randInt(1, 12) });
  const root = ids[randInt(0, ids.length - 1)];
  return { nodes, edges, root };
}

// ── Coordinate mapping ────────────────────────────────────────────────────────

export function toSvg(x: number, y: number, w: number, h: number, pad: number) {
  if (x > 1 || y > 1) return { x, y };
  return { x: pad + x * (w - 2 * pad), y: (h - pad) - y * (h - 2 * pad) };
}

// ── Edge geometry & label conflict resolution ─────────────────────────────────

export const EDGE_CURVE = 60;
const CHAR_W = 0.62;
const LABEL_PAD_X = 5;
const LABEL_PAD_Y = 3;

export function labelPos(g: EdgeGeom) {
  return { lx: g.mx + g.px * g.curveOffset * 0.5, ly: g.my + g.py * g.curveOffset * 0.5 };
}

export function labelSize(weight: number, fontSize: number) {
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

export function computeEdgeGeom(
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
        a.curveOffset += sign * EDGE_CURVE;
        b.curveOffset -= sign * EDGE_CURVE;
      }
    }
  }
  return geom;
}

// ── Algorithm state ───────────────────────────────────────────────────────────

export function makeInitSnapshot(root: string, nodeCount: number): Snapshot {
  return {
    phase: nodeCount <= 1 ? 'done' : 'select-edge',
    U: new Set([root]),
    T: new Set(),
    history: [{ addedEdge: null, U: [root] }],
  };
}

// ── Shared table styles ───────────────────────────────────────────────────────

export const thStyle: CSSProperties = {
  border: '1px solid var(--border)',
  padding: '3px 10px',
  textAlign: 'center',
  fontWeight: 600,
  background: 'color-mix(in srgb, currentColor 6%, var(--bg))',
};

export const tdBase: CSSProperties = {
  border: '1px solid var(--border)',
  padding: '3px 10px',
  textAlign: 'center',
  whiteSpace: 'nowrap',
};
