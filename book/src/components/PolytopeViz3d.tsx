/**
 * PolytopeViz3d — Interactive 3D polytope visualizer.
 *
 * Accepts linear constraints in x_1, x_2, x_3, enumerates the vertices of
 * the feasible region via H-representation, computes the convex hull, and
 * renders it on a <canvas> with perspective projection and click-drag
 * arcball rotation.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import katex from 'katex';
import { useTouchActivation } from './useTouchActivation';

// ─── Types ────────────────────────────────────────────────────────────────────

type Vec3 = [number, number, number];
type Quat = [number, number, number, number]; // [w, x, y, z]

/** Constraint normalized to a·x ≤ b */
interface Constraint {
  a: Vec3;
  b: number;
}

/** Triangular face of the convex hull, with outward normal */
interface TriFace {
  indices: [number, number, number];
  normal: Vec3;
}

/** Polygonal face: vertices ordered CCW when viewed from outside */
interface PolyFace {
  indices: number[];
  normal: Vec3;
  /** Original constraint string for the hyperplane this face lies on */
  constraintLabel?: string;
}

interface Scene {
  vertices: Vec3[];
  polyFaces: PolyFace[];
  center: Vec3;
  scale: number;
}

interface Tooltip {
  content: string;
  x: number; // canvas-relative px
  y: number;
}

export interface PolytopeViz3dProps {
  constraints: string[];
  width?: number;
  height?: number;
  /** Draw coordinate axes inside the 3D scene. Defaults to true. */
  showAxes?: boolean;
}

// ─── Vec3 helpers ─────────────────────────────────────────────────────────────

const vadd   = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const vsub   = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const vscale = (v: Vec3, s: number): Vec3 => [v[0]*s, v[1]*s, v[2]*s];
const vdot   = (a: Vec3, b: Vec3): number => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const vcross = (a: Vec3, b: Vec3): Vec3 => [
  a[1]*b[2] - a[2]*b[1],
  a[2]*b[0] - a[0]*b[2],
  a[0]*b[1] - a[1]*b[0],
];
const vlen  = (v: Vec3): number => Math.sqrt(vdot(v, v));
const vnorm = (v: Vec3): Vec3 => { const l = vlen(v); return l < 1e-12 ? [0, 0, 1] : vscale(v, 1/l); };
const vavg  = (...vs: Vec3[]): Vec3 => {
  const s: Vec3 = [0, 0, 0];
  for (const v of vs) { s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; }
  return vscale(s, 1 / vs.length);
};

// ─── Display helpers ──────────────────────────────────────────────────────────

/** Convert a constraint string to a LaTeX expression for KaTeX rendering. */
function constraintToLatex(s: string): string {
  return s
    .replace(/\*/g, '')
    .replace(/<=/g, '\\leq')
    .replace(/>=/g, '\\geq')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderConstraint(s: string): string {
  return katex.renderToString(constraintToLatex(s), { throwOnError: false, displayMode: false });
}

/** Format a coordinate value: integers cleanly, simple fractions where possible */
function fmtNum(x: number): string {
  const r = Math.round(x * 1e6) / 1e6;
  if (Math.abs(r - Math.round(r)) < 1e-6) return String(Math.round(r));
  for (const d of [2, 3, 4, 6, 8]) {
    const n = Math.round(r * d);
    if (n !== 0 && Math.abs(n / d - r) < 1e-5) return `${n}/${d}`;
  }
  return r.toFixed(3).replace(/\.?0+$/, '');
}

// ─── Quaternion helpers ───────────────────────────────────────────────────────

const qmul = (a: Quat, b: Quat): Quat => {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw*bw - ax*bx - ay*by - az*bz,
    aw*bx + ax*bw + ay*bz - az*by,
    aw*by - ax*bz + ay*bw + az*bx,
    aw*bz + ax*by - ay*bx + az*bw,
  ];
};

const qrotate = (q: Quat, v: Vec3): Vec3 => {
  const [w, x, y, z] = q;
  const t = vscale(vcross([x, y, z], v), 2);
  return vadd(vadd(v, vscale(t, w)), vcross([x, y, z], t));
};

const qfromAxisAngle = (axis: Vec3, angle: number): Quat => {
  const a = vnorm(axis);
  const s = Math.sin(angle / 2);
  return [Math.cos(angle / 2), a[0]*s, a[1]*s, a[2]*s];
};

const qnorm = (q: Quat): Quat => {
  const l = Math.sqrt(q[0]**2 + q[1]**2 + q[2]**2 + q[3]**2);
  return l < 1e-12 ? [1, 0, 0, 0] : [q[0]/l, q[1]/l, q[2]/l, q[3]/l];
};

// ─── Constraint parser ────────────────────────────────────────────────────────

/**
 * Parse "2*x_1 - x_2 + 3 <= 4" → {a: [2,-1,0], b: 1}.
 * Supports <=, >=, variables x_1/x_2/x_3 (or x1/x2/x3),
 * integer/float coefficients, and constants on the LHS.
 */
function parseConstraint(s: string): Constraint | null {
  s = s.replace(/\s+/g, '');
  if (!s) return null;

  let flip = false;
  let sepIdx: number;

  if ((sepIdx = s.indexOf('<=')) !== -1) {
    flip = false;
  } else if ((sepIdx = s.indexOf('>=')) !== -1) {
    flip = true;
  } else {
    return null;
  }

  const lhsStr = s.slice(0, sepIdx);
  const rhsStr = s.slice(sepIdx + 2);
  const rhs = parseFloat(rhsStr);
  if (isNaN(rhs)) return null;

  const a: Vec3 = [0, 0, 0];
  let lhsConst = 0;

  // Prepend '+' so every term starts with a sign
  const expr = /^[+\-]/.test(lhsStr) ? lhsStr : '+' + lhsStr;
  const termRe = /[+\-][^+\-]*/g;
  let m: RegExpExecArray | null;

  while ((m = termRe.exec(expr)) !== null) {
    const term = m[0];
    const sign = term[0] === '-' ? -1 : 1;
    const body = term.slice(1);

    // Match [coefficient*]x_?[123]
    const vm = body.match(/^(\d*\.?\d*)\*?x_?([123])$/i);
    if (vm) {
      const coeff = vm[1] === '' ? 1.0 : parseFloat(vm[1]);
      if (!isNaN(coeff)) a[parseInt(vm[2]) - 1] += sign * coeff;
    } else {
      const val = parseFloat(body);
      if (!isNaN(val)) lhsConst += sign * val;
    }
  }

  // Move LHS constant to RHS: a·x + c ≤ rhs → a·x ≤ rhs - c
  const b = rhs - lhsConst;
  return flip ? { a: vscale(a, -1) as Vec3, b: -b } : { a, b };
}

// ─── 3×3 linear solver ───────────────────────────────────────────────────────

function solve3x3(rows: [Vec3, Vec3, Vec3], rhs: Vec3): Vec3 | null {
  const [r0, r1, r2] = rows;
  const det =
    r0[0] * (r1[1]*r2[2] - r1[2]*r2[1]) -
    r0[1] * (r1[0]*r2[2] - r1[2]*r2[0]) +
    r0[2] * (r1[0]*r2[1] - r1[1]*r2[0]);

  if (Math.abs(det) < 1e-10) return null;
  const inv = 1 / det;

  return [
    inv * (rhs[0]*(r1[1]*r2[2]-r1[2]*r2[1]) - r0[1]*(rhs[1]*r2[2]-r1[2]*rhs[2]) + r0[2]*(rhs[1]*r2[1]-r1[1]*rhs[2])),
    inv * (r0[0]*(rhs[1]*r2[2]-r1[2]*rhs[2]) - rhs[0]*(r1[0]*r2[2]-r1[2]*r2[0]) + r0[2]*(r1[0]*rhs[2]-rhs[1]*r2[0])),
    inv * (r0[0]*(r1[1]*rhs[2]-rhs[1]*r2[1]) - r0[1]*(r1[0]*rhs[2]-rhs[1]*r2[0]) + rhs[0]*(r1[0]*r2[1]-r1[1]*r2[0])),
  ];
}

// ─── Vertex enumeration ───────────────────────────────────────────────────────

function findVertices(cs: Constraint[]): Vec3[] {
  const verts: Vec3[] = [];
  const n = cs.length;
  const TOL = 1e-6;

  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const pt = solve3x3(
          [cs[i].a, cs[j].a, cs[k].a],
          [cs[i].b, cs[j].b, cs[k].b],
        );
        if (!pt) continue;

        // Feasibility: every constraint satisfied
        if (!cs.every(c => vdot(c.a, pt) <= c.b + TOL)) continue;

        // Dedup
        if (verts.some(v =>
          Math.abs(v[0]-pt[0]) < TOL &&
          Math.abs(v[1]-pt[1]) < TOL &&
          Math.abs(v[2]-pt[2]) < TOL,
        )) continue;

        verts.push(pt);
      }
    }
  }
  return verts;
}

// ─── Convex hull ──────────────────────────────────────────────────────────────

/**
 * Brute-force O(n⁴): for each triple, check all other points lie on one side.
 * Returns triangular faces with outward normals.
 */
function computeTriFaces(vertices: Vec3[]): TriFace[] {
  const n = vertices.length;
  if (n < 3) return [];

  const centroid = vavg(...vertices);
  const faces: TriFace[] = [];
  const TOL = 1e-6;

  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const rawN = vcross(vsub(vertices[j], vertices[i]), vsub(vertices[k], vertices[i]));
        if (vlen(rawN) < 1e-10) continue;

        const normal = vnorm(rawN);
        const d = vdot(normal, vertices[i]);

        let minD = Infinity, maxD = -Infinity;
        for (let m = 0; m < n; m++) {
          if (m === i || m === j || m === k) continue;
          const dist = vdot(normal, vertices[m]) - d;
          minD = Math.min(minD, dist); maxD = Math.max(maxD, dist);
        }

        // Not a hull face if vertices span both sides
        if (maxD > TOL && minD < -TOL) continue;

        // Orient normal outward (away from centroid)
        const cDist = vdot(normal, centroid) - d;
        const outward = cDist <= 0 ? normal : vscale(normal, -1) as Vec3;
        const inds: [number, number, number] = cDist <= 0 ? [i, j, k] : [i, k, j];
        faces.push({ indices: inds, normal: outward });
      }
    }
  }
  return faces;
}

/**
 * Group coplanar triangles into convex polygonal faces, ordering vertices
 * by angle around the face centroid.
 */
function mergeCoplanarFaces(triFaces: TriFace[], vertices: Vec3[]): PolyFace[] {
  const TOL = 1e-4;
  const groups: TriFace[][] = [];

  for (const face of triFaces) {
    const d = vdot(face.normal, vertices[face.indices[0]]);
    let placed = false;
    for (const grp of groups) {
      const gd = vdot(grp[0].normal, vertices[grp[0].indices[0]]);
      if (Math.abs(vdot(face.normal, grp[0].normal) - 1) < TOL && Math.abs(d - gd) < TOL) {
        grp.push(face); placed = true; break;
      }
    }
    if (!placed) groups.push([face]);
  }

  return groups.map(grp => {
    const idxSet = new Set<number>();
    for (const f of grp) f.indices.forEach(i => idxSet.add(i));
    const idxArr = [...idxSet];
    const faceVerts = idxArr.map(i => vertices[i]);
    const centroid = vavg(...faceVerts);
    const normal = grp[0].normal;

    // Local 2D basis in the plane
    let u = vnorm(vsub(faceVerts[0], centroid));
    if (vlen(u) < 1e-10) {
      const tmp: Vec3 = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      u = vnorm(vcross(normal, tmp));
    }
    const v = vnorm(vcross(normal, u));

    const sorted = idxArr
      .map(idx => { const dv = vsub(vertices[idx], centroid); return { idx, angle: Math.atan2(vdot(dv, v), vdot(dv, u)) }; })
      .sort((a, b) => a.angle - b.angle);

    return { indices: sorted.map(s => s.idx), normal };
  });
}

// ─── Scene builder ────────────────────────────────────────────────────────────

function buildScene(constraints: Constraint[], constraintStrings: string[]): Scene {
  const vertices = findVertices(constraints);
  if (vertices.length < 3) {
    return { vertices: [], polyFaces: [], center: [0, 0, 0], scale: 1 };
  }

  const triFaces = computeTriFaces(vertices);
  const polyFaces = mergeCoplanarFaces(triFaces, vertices);

  // Tag each face with the constraint whose hyperplane it lies on
  const TOL = 1e-4;
  for (const face of polyFaces) {
    for (let ci = 0; ci < constraints.length; ci++) {
      const c = constraints[ci];
      if (face.indices.every(i => Math.abs(vdot(c.a, vertices[i]) - c.b) < TOL)) {
        face.constraintLabel = constraintStrings[ci];
        break;
      }
    }
  }

  const lo: Vec3 = [...vertices[0]];
  const hi: Vec3 = [...vertices[0]];
  for (const v of vertices) {
    lo[0] = Math.min(lo[0], v[0]); hi[0] = Math.max(hi[0], v[0]);
    lo[1] = Math.min(lo[1], v[1]); hi[1] = Math.max(hi[1], v[1]);
    lo[2] = Math.min(lo[2], v[2]); hi[2] = Math.max(hi[2], v[2]);
  }
  const center: Vec3 = [(lo[0]+hi[0])/2, (lo[1]+hi[1])/2, (lo[2]+hi[2])/2];
  const scale = 1.4 / Math.max(hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2], 0.01);

  return { vertices, polyFaces, center, scale };
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

const CAM_DIST  = 5;
const FOCAL_LEN = 380;
// Light fixed in view/screen space: top-right, slightly toward camera
const VIEW_LIGHT = vnorm([0.4, 0.7, -0.6]);

const AXIS_COLORS = ['#e05555', '#50b555', '#5585e0'] as const;
const AXIS_LABELS = ['x₁', 'x₂', 'x₃'] as const;

/** Shared perspective projector — used by both the renderer and the hit-tester. */
function makeProjector(scene: Scene, rot: Quat, w: number, h: number, zoom = 1, pan: [number, number] = [0, 0]) {
  const { center, scale } = scene;
  const cx = w / 2, cy = h / 2;
  return (v: Vec3): { sx: number; sy: number; sz: number } => {
    const c = vscale(vsub(v, center), scale * zoom);
    const r = qrotate(rot, c);
    const z = r[2] + CAM_DIST;
    const f = FOCAL_LEN / Math.max(z, 0.1);
    return { sx: cx + r[0] * f + pan[0], sy: cy - r[1] * f + pan[1], sz: r[2] };
  };
}

// ─── Hit testing ──────────────────────────────────────────────────────────────

type Projected = { sx: number; sy: number; sz: number };

function pointInPolygon(px: number, py: number, pts: Projected[]): boolean {
  let inside = false;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const { sx: xi, sy: yi } = pts[i];
    const { sx: xj, sy: yj } = pts[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Return the topmost vertex within 8 px of (mx, my), or the front-most face
 * whose projected polygon contains (mx, my). Vertices take priority.
 */
function hitTest(
  mx: number, my: number,
  proj: Projected[],
  faces: PolyFace[],
): { kind: 'vertex'; idx: number } | { kind: 'face'; idx: number } | null {
  // Vertex hit: closest within 8 px
  const RADIUS = 8;
  let bestDist = RADIUS, bestVert = -1;
  for (let i = 0; i < proj.length; i++) {
    const d = Math.hypot(mx - proj[i].sx, my - proj[i].sy);
    if (d < bestDist) { bestDist = d; bestVert = i; }
  }
  if (bestVert >= 0) return { kind: 'vertex', idx: bestVert };

  // Face hit: test front-to-back (smallest sz = closest to camera first)
  const order = faces
    .map((f, i) => ({ i, sz: f.indices.reduce((s, vi) => s + proj[vi].sz, 0) / f.indices.length }))
    .sort((a, b) => a.sz - b.sz);

  for (const { i } of order) {
    if (pointInPolygon(mx, my, faces[i].indices.map(vi => proj[vi]))) {
      return { kind: 'face', idx: i };
    }
  }
  return null;
}

/**
 * Return a "nice" tick spacing for the given axis range, targeting ~5 ticks.
 * Snaps to 1-2-5 multiples of powers of ten.
 */
function niceTickStep(range: number): number {
  if (range <= 0) return 1;
  const rough  = range / 5;
  const pow10  = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1e-10))));
  const norm   = rough / pow10;
  const step   = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * pow10;
}

/**
 * Draw the x₁, x₂, x₃ coordinate axes in the 3D scene using the same
 * perspective projection as the polytope. Each axis runs from 0 (or the
 * polytope's minimum coordinate if negative) to 15% past its maximum,
 * with an arrowhead, label at the tip, and tick marks at nice intervals.
 *
 * Called before the faces so the semi-transparent polytope sits on top.
 */
function drawSceneAxes(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  project: (v: Vec3) => { sx: number; sy: number; sz: number },
): void {
  const { vertices } = scene;
  if (vertices.length === 0) return;

  // World-space bounding box
  const lo: Vec3 = [...vertices[0]];
  const hi: Vec3 = [...vertices[0]];
  for (const v of vertices) {
    lo[0] = Math.min(lo[0], v[0]); hi[0] = Math.max(hi[0], v[0]);
    lo[1] = Math.min(lo[1], v[1]); hi[1] = Math.max(hi[1], v[1]);
    lo[2] = Math.min(lo[2], v[2]); hi[2] = Math.max(hi[2], v[2]);
  }

  // Axis start: 0 (or lo if the polytope dips below 0)
  // Axis end:   hi + 15% of the positive span
  const starts: Vec3[] = [
    [Math.min(0, lo[0]), 0, 0],
    [0, Math.min(0, lo[1]), 0],
    [0, 0, Math.min(0, lo[2])],
  ];
  const ends: Vec3[] = [
    [hi[0] + 0.15 * (hi[0] - Math.min(0, lo[0])), 0, 0],
    [0, hi[1] + 0.15 * (hi[1] - Math.min(0, lo[1])), 0],
    [0, 0, hi[2] + 0.15 * (hi[2] - Math.min(0, lo[2]))],
  ];

  for (let i = 0; i < 3; i++) {
    const ps = project(starts[i]);
    const pe = project(ends[i]);
    const dx = pe.sx - ps.sx;
    const dy = pe.sy - ps.sy;
    const dist = Math.hypot(dx, dy);
    if (dist < 3) continue; // axis is nearly edge-on; skip to avoid zero-length arrowhead

    const color = AXIS_COLORS[i];
    const ang = Math.atan2(dy, dx);

    // Axis line
    ctx.beginPath();
    ctx.moveTo(ps.sx, ps.sy);
    ctx.lineTo(pe.sx, pe.sy);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Arrowhead
    const aLen = Math.min(10, dist * 0.25);
    ctx.beginPath();
    ctx.moveTo(pe.sx, pe.sy);
    ctx.lineTo(pe.sx - aLen * Math.cos(ang - 0.45), pe.sy - aLen * Math.sin(ang - 0.45));
    ctx.lineTo(pe.sx - aLen * Math.cos(ang + 0.45), pe.sy - aLen * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // Label just past the arrowhead
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(AXIS_LABELS[i], pe.sx + 15 * Math.cos(ang), pe.sy + 15 * Math.sin(ang));

    // Tick marks at nice intervals along the axis
    const axisLo  = starts[i][i]; // Math.min(0, lo[i])
    const step     = niceTickStep(hi[i] - axisLo);
    // Unit vector perpendicular to the projected axis (90° CCW in screen space)
    const ax = dx / dist, ay = dy / dist;
    const px = -ay,       py =  ax;
    const TICK = 4;          // half-length of tick in px
    const LABEL_OFF = TICK + 7; // label distance from tick centre
    const n0 = Math.ceil (axisLo / step - 1e-9);
    const n1 = Math.floor(hi[i]  / step + 1e-9);

    ctx.strokeStyle = color;
    ctx.lineWidth   = 1;
    ctx.font        = '11px system-ui, sans-serif';
    ctx.fillStyle   = color;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';

    for (let n = n0; n <= n1; n++) {
      const t = n * step;
      if (Math.abs(t) < step * 1e-6) continue; // skip origin (already has a dot)
      const pt3: Vec3 = [0, 0, 0]; pt3[i] = t;
      const pt = project(pt3);
      ctx.beginPath();
      ctx.moveTo(pt.sx - px * TICK, pt.sy - py * TICK);
      ctx.lineTo(pt.sx + px * TICK, pt.sy + py * TICK);
      ctx.stroke();
      ctx.fillText(fmtNum(t), pt.sx + px * LABEL_OFF, pt.sy + py * LABEL_OFF);
    }
  }

  // Dot at the origin
  const po = project([0, 0, 0]);
  ctx.beginPath();
  ctx.arc(po.sx, po.sy, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#888';
  ctx.fill();
}

/**
 * Draw the (infinite) supporting hyperplane for a face as a large tinted
 * rectangle extending across the whole canvas, behind the polytope faces.
 */
function drawHyperplane(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  pf: PolyFace,
  dark: boolean,
  project: (v: Vec3) => { sx: number; sy: number; sz: number },
): void {
  const { vertices, center, scale } = scene;
  const n = pf.normal;
  const d = vdot(n, vertices[pf.indices[0]]);

  // Closest point on the hyperplane to the scene center
  const centerOnPlane: Vec3 = vadd(center, vscale(n, d - vdot(n, center)));

  // Two orthonormal basis vectors spanning the plane
  const tmp: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = vnorm(vcross(n, tmp));
  const v = vcross(n, u) as Vec3; // n⊥u, both unit → v is already unit

  // Rectangle large enough to project past every canvas edge at any rotation
  const R = 5 / scale;
  const corners: Vec3[] = [
    vadd(vadd(centerOnPlane, vscale(u,  R)), vscale(v,  R)),
    vadd(vadd(centerOnPlane, vscale(u, -R)), vscale(v,  R)),
    vadd(vadd(centerOnPlane, vscale(u, -R)), vscale(v, -R)),
    vadd(vadd(centerOnPlane, vscale(u,  R)), vscale(v, -R)),
  ];

  const pts = corners.map(project);
  ctx.beginPath();
  ctx.moveTo(pts[0].sx, pts[0].sy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
  ctx.closePath();

  const [r, g, b] = dark ? [251, 191, 36] : [245, 158, 11];
  ctx.fillStyle = `rgba(${r},${g},${b},0.10)`;
  ctx.fill();
  ctx.strokeStyle = dark ? 'rgba(251,191,36,0.40)' : 'rgba(180,100,0,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  scene: Scene,
  rot: Quat,
  dark: boolean,
  showAxes: boolean,
  activeLabels: ReadonlySet<string>,
  hoverVertex: number | null,
  zoom: number,
  pan: [number, number],
): void {
  ctx.clearRect(0, 0, w, h);
  const { vertices, polyFaces, center, scale } = scene;

  if (vertices.length === 0) {
    ctx.fillStyle = dark ? '#9ca3af' : '#6b7280';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Polytope is empty or unbounded', w / 2, h / 2);
    return;
  }

  const project = makeProjector(scene, rot, w, h, zoom, pan);
  const proj = vertices.map(project);
  const anyHighlit = activeLabels.size > 0;

  // Axes drawn first so the polytope faces sit on top of them
  if (showAxes) drawSceneAxes(ctx, scene, project);

  // Hyperplanes for all active faces, behind the polytope faces
  if (anyHighlit) {
    for (const pf of polyFaces) {
      if (pf.constraintLabel != null && activeLabels.has(pf.constraintLabel)) {
        drawHyperplane(ctx, scene, pf, dark, project);
      }
    }
  }

  // Compute depth + rotated normal per face, then sort back→front
  const faceData = polyFaces.map(pf => {
    const avgSz = pf.indices.reduce((s, i) => s + proj[i].sz, 0) / pf.indices.length;
    const rn = qrotate(rot, pf.normal) as Vec3;
    return { pf, avgSz, rn };
  });
  faceData.sort((a, b) => a.avgSz - b.avgSz);

  // Palette
  const frontFill  = dark ? [90, 160, 220]  : [65, 125, 210];
  const backFill   = dark ? [70, 120, 170]  : [130, 170, 230];
  const edgeLight  = dark ? 'rgba(180,215,255,0.9)' : 'rgba(20,60,150,0.85)';
  const edgeDark   = dark ? 'rgba(120,170,210,0.5)' : 'rgba(90,130,200,0.4)';
  const hlFill     = dark ? [251, 191, 36]  : [245, 158, 11];
  const hlEdge     = dark ? 'rgba(255,220,60,0.95)' : 'rgba(180,100,0,0.9)';

  for (const { pf, rn } of faceData) {
    const isHighlit = pf.constraintLabel != null && activeLabels.has(pf.constraintLabel);
    const frontFacing = rn[2] < 0;

    const diffuse = Math.max(0, vdot(rn, VIEW_LIGHT));
    const ambient = isHighlit ? 0.55 : 0.35;
    const brightness = ambient + (1 - ambient) * diffuse;

    const [r, g, b] = isHighlit ? hlFill : (frontFacing ? frontFill : backFill);
    const alpha = isHighlit
      ? 0.90
      : (frontFacing ? 0.82 : 0.30) * (anyHighlit ? 0.45 : 1.0);

    ctx.beginPath();
    const fp = proj[pf.indices[0]];
    ctx.moveTo(fp.sx, fp.sy);
    for (let i = 1; i < pf.indices.length; i++) {
      const p = proj[pf.indices[i]];
      ctx.lineTo(p.sx, p.sy);
    }
    ctx.closePath();

    ctx.fillStyle = `rgba(${Math.round(r*brightness)},${Math.round(g*brightness)},${Math.round(b*brightness)},${alpha})`;
    ctx.fill();

    ctx.strokeStyle = isHighlit ? hlEdge : (frontFacing ? edgeLight : edgeDark);
    ctx.lineWidth = isHighlit ? 2 : (frontFacing ? 1.5 : 0.75);
    ctx.stroke();
  }

  // Hovered-vertex dot — drawn last so it sits on top of everything
  if (hoverVertex !== null) {
    const pt = proj[hoverVertex];
    ctx.beginPath();
    ctx.arc(pt.sx, pt.sy, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = dark ? '#ffffff' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

}

function drawAxisIndicator(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  rot: Quat,
  dark: boolean,
): void {
  // Axis indicator in bottom-left corner
  const ox = 48, oy = h - 44;
  const len = 34;

  const axesDefs: [Vec3, string, string][] = [
    [[1,0,0], 'x₁', '#e05555'],
    [[0,1,0], 'x₂', '#50b555'],
    [[0,0,1], 'x₃', '#5585e0'],
  ];

  for (const [dir, label, color] of axesDefs) {
    const r = qrotate(rot, dir);
    const ex = ox + r[0] * len;
    const ey = oy - r[1] * len;

    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Arrowhead
    const ang = Math.atan2(ey - oy, ex - ox);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 7*Math.cos(ang - 0.45), ey - 7*Math.sin(ang - 0.45));
    ctx.lineTo(ex - 7*Math.cos(ang + 0.45), ey - 7*Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // Label
    ctx.fillStyle = color;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, ex + 13*Math.cos(ang), ey + 13*Math.sin(ang));
  }

  ctx.beginPath();
  ctx.arc(ox, oy, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = dark ? '#cbd5e1' : '#475569';
  ctx.fill();
}

// ─── Default initial rotation (slight tilt so all 3 axes are visible) ─────────

const DEFAULT_ZOOM = 1.6;

const DEFAULT_ROT: Quat = qnorm(qmul(
  qfromAxisAngle([1, 0, 0], -Math.PI / 2 + 0.5),
  qfromAxisAngle([0, 0, 1], 1.0 - Math.PI),
));

// ─── Component ────────────────────────────────────────────────────────────────

export function PolytopeViz3d({ constraints, width = 520, height = 390, showAxes = true }: PolytopeViz3dProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const sceneRef    = useRef<Scene | null>(null);
  const rotRef      = useRef<Quat>(DEFAULT_ROT);
  const dragRef     = useRef<{ x: number; y: number; mode: 'rotate' | 'pan' } | null>(null);
  const zoomRef     = useRef(DEFAULT_ZOOM);
  const panRef      = useRef<[number, number]>([0, 0]);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  const dprRef      = useRef(1);
  const showAxesRef = useRef(showAxes);
  showAxesRef.current = showAxes;

  const activeLabelsRef  = useRef<Set<string>>(new Set());
  const [activeLabels, setActiveLabels] = useState<Set<string>>(new Set());
  const hoverVertexRef   = useRef<number | null>(null);

  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [constraintLabels, setConstraintLabels] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const helpWrapRef = useRef<HTMLDivElement>(null);

  // On touch devices, gate gestures behind a tap so page-scroll isn't hijacked.
  const { gestureBlocked, gestureBlockedRef, activate } = useTouchActivation(containerRef);

  // Close help popup when clicking outside it
  useEffect(() => {
    if (!showHelp) return;
    const handler = (e: MouseEvent) => {
      if (helpWrapRef.current && !helpWrapRef.current.contains(e.target as Node)) {
        setShowHelp(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showHelp]);

  // ── Render ────────────────────────────────────────────────────────────────

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sceneRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = dprRef.current;
    ctx.save();
    ctx.scale(dpr, dpr);
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    drawScene(ctx, width, height, sceneRef.current, rotRef.current, dark, showAxesRef.current, activeLabelsRef.current, hoverVertexRef.current, zoomRef.current, panRef.current);
    ctx.restore();
  }, [width, height]);

  // ── Set up canvas DPR + parse constraints ─────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    // Set the display width; leave height `auto` so CSS `max-width: 100%`
    // shrinks the canvas proportionally on narrow screens (the canvas keeps
    // its intrinsic aspect ratio from the width/height attributes above)
    // instead of squashing the height and skewing the figure.
    canvas.style.width  = `${width}px`;
    canvas.style.height = 'auto';
  }, [width, height]);

  useEffect(() => {
    const pairs = constraints
      .map(s => ({ s, c: parseConstraint(s) }))
      .filter((p): p is { s: string; c: Constraint } => p.c !== null);
    sceneRef.current = buildScene(pairs.map(p => p.c), pairs.map(p => p.s));
    setConstraintLabels(pairs.map(p => p.s));
    redraw();
  }, [constraints, redraw]);

  // Re-draw on dark-mode change
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', redraw);
    return () => mq.removeEventListener('change', redraw);
  }, [redraw]);

  // ── Scroll-wheel zoom (non-passive so preventDefault works) ───────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1 / 0.9 : 0.9;
      zoomRef.current = Math.max(0.2, Math.min(8, zoomRef.current * factor));
      redraw();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [redraw]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (gestureBlockedRef.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const mode = e.button === 2 || e.shiftKey ? 'pan' : 'rotate';
    dragRef.current = { x: e.clientX, y: e.clientY, mode };
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.preventDefault();
  }, [gestureBlockedRef]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (gestureBlockedRef.current) return;
    // Keep pointer map current
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // ── Two-pointer: simultaneous pinch-zoom + pan ─────────────────────────
    if (pointersRef.current.size === 2) {
      const [p1, p2] = [...pointersRef.current.values()];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      if (lastPinchRef.current !== null) {
        zoomRef.current = Math.max(0.2, Math.min(8, zoomRef.current * dist / lastPinchRef.current.dist));
        panRef.current  = [panRef.current[0] + (midX - lastPinchRef.current.midX) * dsx,
                           panRef.current[1] + (midY - lastPinchRef.current.midY) * dsy];
        redraw();
      }
      lastPinchRef.current = { dist, midX, midY };
      setTooltip(null);
      return;
    }

    // Display scale: converts screen-px deltas → internal drawing-px
    const dispRect = canvasRef.current?.getBoundingClientRect();
    const dsx = dispRect && dispRect.width  > 0 ? width  / dispRect.width  : 1;
    const dsy = dispRect && dispRect.height > 0 ? height / dispRect.height : 1;

    // ── Single-pointer drag: rotate or pan ────────────────────────────────
    if (dragRef.current) {
      const { mode } = dragRef.current;
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      dragRef.current = { ...dragRef.current, x: e.clientX, y: e.clientY };
      if (mode === 'pan') {
        panRef.current = [panRef.current[0] + dx * dsx, panRef.current[1] + dy * dsy];
      } else {
        const sens = 0.006;
        rotRef.current = qnorm(qmul(
          qfromAxisAngle([0, 1, 0], dx * sens),
          qmul(qfromAxisAngle([1, 0, 0], dy * sens), rotRef.current),
        ));
      }
      redraw();
      setTooltip(null);
      return;
    }

    // ── Hover hit-test ────────────────────────────────────────────────────
    const scene = sceneRef.current;
    if (!scene || !dispRect || scene.vertices.length === 0) { setTooltip(null); return; }

    const mx = (e.clientX - dispRect.left) * dsx;
    const my = (e.clientY - dispRect.top)  * dsy;

    const project = makeProjector(scene, rotRef.current, width, height, zoomRef.current, panRef.current);
    const proj = scene.vertices.map(project);
    const hit = hitTest(mx, my, proj, scene.polyFaces);

    const newHover = hit?.kind === 'vertex' ? hit.idx : null;
    if (newHover !== hoverVertexRef.current) {
      hoverVertexRef.current = newHover;
      redraw();
    }

    if (!hit || hit.kind !== 'vertex') { setTooltip(null); return; }

    const v = scene.vertices[hit.idx];
    const tipX = e.clientX - dispRect.left;
    const tipY = e.clientY - dispRect.top;
    setTooltip({ content: `(${fmtNum(v[0])}, ${fmtNum(v[1])}, ${fmtNum(v[2])})`, x: tipX, y: tipY });
  }, [redraw, width, height, gestureBlockedRef]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) lastPinchRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;
  }, []);

  const resetView = useCallback(() => {
    rotRef.current = DEFAULT_ROT;
    zoomRef.current = DEFAULT_ZOOM;
    panRef.current  = [0, 0];
    redraw();
  }, [redraw]);

  const onConstraintClick = useCallback((label: string) => {
    const next = new Set(activeLabelsRef.current);
    if (next.has(label)) next.delete(label); else next.add(label);
    activeLabelsRef.current = next;
    setActiveLabels(new Set(next));
    redraw();
  }, [redraw]);

  return (
    <div className="polytope-viz" ref={containerRef} style={{ position: 'relative' }}>
      <div className="polytope-viz-canvas-wrap">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={(e) => { onPointerUp(e); setTooltip(null); hoverVertexRef.current = null; redraw(); }}
          onContextMenu={(e) => e.preventDefault()}
          style={{ display: 'block', cursor: 'grab', touchAction: gestureBlocked ? 'auto' : 'none', userSelect: 'none' }}
          aria-label="Interactive 3D polytope visualization. Drag to rotate."
          role="img"
        />
        {gestureBlocked && (
          <button
            type="button"
            className="polytope-viz-touch-overlay"
            onClick={activate}
            aria-label="Activate figure interaction"
          >
            <span>Tap to interact</span>
          </button>
        )}
      </div>
      {tooltip && (
        <div
          className="polytope-viz-tooltip"
          style={{ left: tooltip.x + 14, top: tooltip.y - 14 }}
        >
          {tooltip.content}
        </div>
      )}
      <div className="polytope-viz-controls">
        <button className="polytope-viz-reset" onClick={resetView} type="button">
          Reset view
        </button>
        <div className="polytope-viz-help-wrap" ref={helpWrapRef}>
          <button
            className="polytope-viz-help"
            onClick={() => setShowHelp(v => !v)}
            type="button"
            aria-label="Show interaction help"
          >?</button>
          {showHelp && (
            <div className="polytope-viz-help-popup" role="tooltip">
              <div className="polytope-viz-help-row"><span>Drag</span><span>Rotate</span></div>
              <div className="polytope-viz-help-row"><span>Shift+drag / right-drag</span><span>Pan</span></div>
              <div className="polytope-viz-help-row"><span>Scroll wheel</span><span>Zoom</span></div>
              <div className="polytope-viz-help-row"><span>Pinch (touch)</span><span>Zoom + pan</span></div>
              <div className="polytope-viz-help-row"><span>Click constraint</span><span>Toggle hyperplane</span></div>
            </div>
          )}
        </div>
      </div>
      {constraintLabels.length > 0 && (
        <ul className="polytope-viz-constraints">
          {constraintLabels.map((label, i) => (
            <li
              key={i}
              className={activeLabels.has(label) ? 'active' : undefined}
              onClick={() => onConstraintClick(label)}
              dangerouslySetInnerHTML={{ __html: renderConstraint(label) }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
