/**
 * PolytopeViz2d — Interactive 2D polytope visualizer.
 *
 * Accepts linear constraints in x_1, x_2, enumerates the vertices of
 * the feasible region via H-representation, computes the convex hull, and
 * renders it on a <canvas> with the feasible polygon, constraint lines,
 * and clickable half-plane highlighting. Supports pan and zoom.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import katex from 'katex';

// ─── Types ────────────────────────────────────────────────────────────────────

type Vec2 = [number, number];

/** Constraint normalized to a·x ≤ b */
interface Constraint2d {
  a: Vec2;
  b: number;
}

interface Tooltip {
  content: string;
  x: number; // canvas-relative px
  y: number;
}

export interface PolytopeViz2dProps {
  constraints: string[];
  /** Optional linear objective in x_1, x_2 (e.g. "x_1 + 2x_2"). Adds a sweepable level-line control. */
  objective?: string;
  width?: number;
  height?: number;
  /** Draw coordinate axes. Defaults to true. */
  showAxes?: boolean;
}

// ─── Vec2 helpers ─────────────────────────────────────────────────────────────

const v2add  = (a: Vec2, b: Vec2): Vec2 => [a[0]+b[0], a[1]+b[1]];
const v2sub  = (a: Vec2, b: Vec2): Vec2 => [a[0]-b[0], a[1]-b[1]];
const v2scale = (v: Vec2, s: number): Vec2 => [v[0]*s, v[1]*s];
const v2dot  = (a: Vec2, b: Vec2): number => a[0]*b[0] + a[1]*b[1];
const v2len  = (v: Vec2): number => Math.sqrt(v2dot(v, v));

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

function renderObjective(s: string): string {
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

/** Smallest denominator q ∈ {1,2,…} for which x·q is (nearly) an integer, else null. */
function simpleDenominator(x: number): number | null {
  for (const q of [1, 2, 3, 4, 5, 6, 8, 10, 12]) {
    if (Math.abs(x * q - Math.round(x * q)) < 1e-6) return q;
  }
  return null;
}

/**
 * Slider increment for sweeping the objective. If the optimum is a simple fraction
 * p/q, step by 1/q so the level line lands exactly on it (and on every vertex value
 * sharing that denominator); otherwise fall back to 0.1.
 */
function objectiveStep(optimum: number): number {
  const q = simpleDenominator(optimum);
  return q ? 1 / q : 0.1;
}

// ─── Constraint parser ────────────────────────────────────────────────────────

/**
 * Parse "2*x_1 - x_2 + 3 <= 4" → {a: [2,-1], b: 1}.
 * Supports <=, >=, variables x_1/x_2 (or x1/x2),
 * integer/float coefficients, and constants on the LHS.
 */
function parseConstraint2d(s: string): Constraint2d | null {
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

  const a: Vec2 = [0, 0];
  let lhsConst = 0;

  // Prepend '+' so every term starts with a sign
  const expr = /^[+\-]/.test(lhsStr) ? lhsStr : '+' + lhsStr;
  const termRe = /[+\-][^+\-]*/g;
  let m: RegExpExecArray | null;

  while ((m = termRe.exec(expr)) !== null) {
    const term = m[0];
    const sign = term[0] === '-' ? -1 : 1;
    const body = term.slice(1);

    // Match [coefficient*]x_?[12]
    const vm = body.match(/^(\d*\.?\d*)\*?x_?([12])$/i);
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
  return flip ? { a: v2scale(a, -1) as Vec2, b: -b } : { a, b };
}

// ─── Objective parser ─────────────────────────────────────────────────────────

/** Parse a linear objective like "x_1 + 2x_2" → [1, 2]. */
function parseObjective2d(s: string): Vec2 | null {
  s = s.replace(/\s+/g, '');
  if (!s) return null;

  const a: Vec2 = [0, 0];
  let matched = false;
  const expr = /^[+\-]/.test(s) ? s : '+' + s;
  const termRe = /[+\-][^+\-]*/g;
  let m: RegExpExecArray | null;

  while ((m = termRe.exec(expr)) !== null) {
    const sign = m[0][0] === '-' ? -1 : 1;
    const vm = m[0].slice(1).match(/^(\d*\.?\d*)\*?x_?([12])$/i);
    if (vm) {
      const coeff = vm[1] === '' ? 1.0 : parseFloat(vm[1]);
      if (!isNaN(coeff)) { a[parseInt(vm[2]) - 1] += sign * coeff; matched = true; }
    }
  }
  return matched ? a : null;
}

// ─── 2×2 linear solver ───────────────────────────────────────────────────────

function solve2x2(rows: [Vec2, Vec2], rhs: Vec2): Vec2 | null {
  const [[a00, a01], [a10, a11]] = rows;
  const det = a00 * a11 - a01 * a10;
  if (Math.abs(det) < 1e-10) return null;
  const inv = 1 / det;
  return [
    inv * (rhs[0] * a11 - a01 * rhs[1]),
    inv * (a00 * rhs[1] - rhs[0] * a10),
  ];
}

// ─── Vertex enumeration ───────────────────────────────────────────────────────

function findVertices2d(cs: Constraint2d[]): Vec2[] {
  const verts: Vec2[] = [];
  const n = cs.length;
  const TOL = 1e-6;

  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const pt = solve2x2(
        [cs[i].a, cs[j].a],
        [cs[i].b, cs[j].b],
      );
      if (!pt) continue;

      // Feasibility: every constraint satisfied
      if (!cs.every(c => v2dot(c.a, pt) <= c.b + TOL)) continue;

      // Dedup
      if (verts.some(v => Math.abs(v[0]-pt[0]) < TOL && Math.abs(v[1]-pt[1]) < TOL)) continue;

      verts.push(pt);
    }
  }
  return verts;
}

// ─── Convex hull (2D) ─────────────────────────────────────────────────────────

/**
 * Sort feasible vertices by angle around their centroid → CCW polygon.
 * Since all returned vertices from findVertices2d are already extreme points,
 * a simple angle-sort gives the convex hull.
 */
function convexHull2d(verts: Vec2[]): Vec2[] {
  if (verts.length < 3) return verts;
  const cx = verts.reduce((s, v) => s + v[0], 0) / verts.length;
  const cy = verts.reduce((s, v) => s + v[1], 0) / verts.length;
  return [...verts].sort((a, b) =>
    Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx),
  );
}

// ─── Scene ────────────────────────────────────────────────────────────────────

interface Scene2d {
  vertices: Vec2[];    // all feasible vertices
  hull: Vec2[];        // CCW-ordered hull
  center: Vec2;
  scale: number;
}

function buildScene2d(constraints: Constraint2d[], w: number, h: number): Scene2d {
  const vertices = findVertices2d(constraints);
  if (vertices.length < 2) {
    return { vertices: [], hull: [], center: [0, 0], scale: 1 };
  }

  const hull = convexHull2d(vertices);

  const lo: Vec2 = [...vertices[0]];
  const hi: Vec2 = [...vertices[0]];
  for (const v of vertices) {
    lo[0] = Math.min(lo[0], v[0]); hi[0] = Math.max(hi[0], v[0]);
    lo[1] = Math.min(lo[1], v[1]); hi[1] = Math.max(hi[1], v[1]);
  }

  const center: Vec2 = [(lo[0]+hi[0])/2, (lo[1]+hi[1])/2];
  // Scale so the polytope fills 75% of whichever canvas dimension binds first.
  const dx = Math.max(hi[0] - lo[0], 1e-6);
  const dy = Math.max(hi[1] - lo[1], 1e-6);
  const scale = Math.min(0.75 * w / dx, 0.75 * h / dy);

  return { vertices, hull, center, scale };
}

// ─── Canvas transform ─────────────────────────────────────────────────────────

interface Transform {
  worldToCanvas: (v: Vec2) => { sx: number; sy: number };
  canvasToWorld: (sx: number, sy: number) => Vec2;
}

function makeTransform(
  scene: Scene2d,
  w: number, h: number,
): Transform {
  const { center, scale } = scene;
  const cx = w / 2, cy = h / 2;
  const s = scale;
  return {
    worldToCanvas: ([wx, wy]) => ({
      sx: cx + (wx - center[0]) * s,
      sy: cy - (wy - center[1]) * s,
    }),
    canvasToWorld: (sx, sy) => [
      (sx - cx) / s + center[0],
      -(sy - cy) / s + center[1],
    ],
  };
}

// ─── Constraint line clipping ─────────────────────────────────────────────────

/**
 * Clip the infinite line a·x = b to the canvas [0,w] × [0,h].
 * Returns two canvas-space endpoints, or null if the line doesn't cross the canvas.
 */
function clipLineToCanvas(
  c: Constraint2d,
  tf: Transform,
  w: number,
  h: number,
): [{ sx: number; sy: number }, { sx: number; sy: number }] | null {
  const { a, b } = c;
  const [a1, a2] = a;
  const TOL = 1e-8;
  const pts: { sx: number; sy: number }[] = [];

  // Parametrize: if |a2| is large, solve for x2 given x1; else solve for x1 given x2.
  // We sample at the 4 canvas-edge world-coordinates, keeping intersections inside.

  if (Math.abs(a2) > TOL) {
    // x2 = (b - a1*x1) / a2
    for (const sxEdge of [0, w]) {
      const [wx] = tf.canvasToWorld(sxEdge, h / 2);
      const wy = (b - a1 * wx) / a2;
      const p = tf.worldToCanvas([wx, wy]);
      if (p.sy >= -10 && p.sy <= h + 10) pts.push(p);
    }
    for (const syEdge of [0, h]) {
      const [, wy_edge] = tf.canvasToWorld(w / 2, syEdge);
      // sy = cy - (wy - center[1])*s + pan[1]  → solve for wy
      // already have wy_edge from canvasToWorld
      // now get wx: a1*wx + a2*wy_edge = b
      if (Math.abs(a1) > TOL) {
        const wx = (b - a2 * wy_edge) / a1;
        const p = tf.worldToCanvas([wx, wy_edge]);
        if (p.sx >= -10 && p.sx <= w + 10) pts.push(p);
      }
    }
  } else if (Math.abs(a1) > TOL) {
    // Vertical line: x1 = b / a1
    const wx = b / a1;
    const p0 = tf.worldToCanvas([wx, tf.canvasToWorld(0, 0)[1]]);
    const p1 = tf.worldToCanvas([wx, tf.canvasToWorld(0, h)[1]]);
    if (p0.sx >= -10 && p0.sx <= w + 10) { pts.push(p0); pts.push(p1); }
  }

  if (pts.length < 2) return null;
  // Return the two most-separated points
  let best: [{ sx: number; sy: number }, { sx: number; sy: number }] | null = null;
  let bestDist = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].sx - pts[j].sx, pts[i].sy - pts[j].sy);
      if (d > bestDist) { bestDist = d; best = [pts[i], pts[j]]; }
    }
  }
  return best;
}

/**
 * Fill the half-plane a·x ≤ b on the canvas using a large polygon clipped
 * to the canvas rectangle (with a generous margin so it covers all visible area).
 */
function fillHalfPlane(
  ctx: CanvasRenderingContext2D,
  c: Constraint2d,
  tf: Transform,
  w: number, h: number,
  dark: boolean,
): void {
  const M = 80; // margin beyond canvas edge
  // Four canvas corners (with margin) in world space
  const corners: Vec2[] = [
    tf.canvasToWorld(-M, -M),
    tf.canvasToWorld(w + M, -M),
    tf.canvasToWorld(w + M, h + M),
    tf.canvasToWorld(-M, h + M),
  ];

  // Sutherland-Hodgman clip against a·x ≤ b
  const { a, b } = c;
  const TOL = 1e-8;
  let poly = corners;

  // Clip poly against a·x ≤ b
  const output: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i];
    const next = poly[(i + 1) % poly.length];
    const dc = v2dot(a, curr) - b;
    const dn = v2dot(a, next) - b;
    if (dc <= TOL) output.push(curr); // curr is inside
    if ((dc < -TOL && dn > TOL) || (dc > TOL && dn < -TOL)) {
      // Edge crosses boundary — find intersection
      const t = dc / (dc - dn);
      output.push(v2add(curr, v2scale(v2sub(next, curr), t)));
    }
  }
  if (output.length < 3) return;

  const canvPts = output.map(p => tf.worldToCanvas(p));
  ctx.beginPath();
  ctx.moveTo(canvPts[0].sx, canvPts[0].sy);
  for (let i = 1; i < canvPts.length; i++) ctx.lineTo(canvPts[i].sx, canvPts[i].sy);
  ctx.closePath();

  const [r, g, b_] = dark ? [251, 191, 36] : [245, 158, 11];
  ctx.fillStyle = `rgba(${r},${g},${b_},0.10)`;
  ctx.fill();
}

/** Clip a (world-space) polygon to the halfplane a·x ≤ b (Sutherland–Hodgman). */
function clipPolygonHalfplane(poly: Vec2[], a: Vec2, b: number): Vec2[] {
  const TOL = 1e-9;
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i];
    const next = poly[(i + 1) % poly.length];
    const dc = v2dot(a, curr) - b;
    const dn = v2dot(a, next) - b;
    if (dc <= TOL) out.push(curr);
    if ((dc < -TOL && dn > TOL) || (dc > TOL && dn < -TOL)) {
      const t = dc / (dc - dn);
      out.push(v2add(curr, v2scale(v2sub(next, curr), t)));
    }
  }
  return out;
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

const AXIS_COLORS_2D = ['#e05555', '#50b555'] as const;
const AXIS_LABELS_2D = ['x₁', 'x₂'] as const;
const OBJ_STROKE = { light: 'rgba(5,150,105,0.95)', dark: 'rgba(52,211,153,0.95)' } as const;
const OBJ_FILL   = { light: 'rgba(16,185,129,0.18)', dark: 'rgba(52,211,153,0.20)' } as const;

/**
 * Draw the objective level line c·x = value, shade the swept region {x ∈ P : c·x ≤ value},
 * draw the increase-direction arrow, and ring the optimal (max c·x) vertex.
 */
function drawObjective(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  scene: Scene2d,
  tf: Transform,
  c: Vec2,
  value: number,
  dark: boolean,
): void {
  const stroke = dark ? OBJ_STROKE.dark : OBJ_STROKE.light;

  // Swept region {x ∈ P : c·x ≤ value}
  if (scene.hull.length >= 3) {
    const swept = clipPolygonHalfplane(scene.hull, c, value);
    if (swept.length >= 3) {
      const pts = swept.map(p => tf.worldToCanvas(p));
      ctx.beginPath();
      ctx.moveTo(pts[0].sx, pts[0].sy);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
      ctx.closePath();
      ctx.fillStyle = dark ? OBJ_FILL.dark : OBJ_FILL.light;
      ctx.fill();
    }
  }

  // Level line c·x = value
  const seg = clipLineToCanvas({ a: c, b: value }, tf, w, h);
  if (seg) {
    ctx.beginPath();
    ctx.moveTo(seg[0].sx, seg[0].sy);
    ctx.lineTo(seg[1].sx, seg[1].sy);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.stroke();
  }

  // Ring every optimal (max c·x) vertex — drawn under the white vertex dots.
  // When the objective is parallel to an edge, the whole edge is optimal, so
  // there can be several tied vertices.
  let bestVal = -Infinity;
  for (const v of scene.vertices) bestVal = Math.max(bestVal, v2dot(c, v));
  const TOL = 1e-6;
  for (const v of scene.vertices) {
    if (v2dot(c, v) < bestVal - TOL) continue;
    const p = tf.worldToCanvas(v);
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = stroke;
    ctx.fill();
  }

  // Increase-direction arrow from the hull centroid
  const clen = v2len(c);
  if (clen > 1e-9 && scene.hull.length >= 1) {
    let cx = 0, cy = 0;
    for (const v of scene.hull) { cx += v[0]; cy += v[1]; }
    cx /= scene.hull.length; cy /= scene.hull.length;
    const base = tf.worldToCanvas([cx, cy]);
    const dirx = c[0] / clen, diry = c[1] / clen;   // world-space; canvas y is flipped below
    const L = 34;
    const tip = { sx: base.sx + dirx * L, sy: base.sy - diry * L };
    ctx.beginPath();
    ctx.moveTo(base.sx, base.sy);
    ctx.lineTo(tip.sx, tip.sy);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    const ang = Math.atan2(tip.sy - base.sy, tip.sx - base.sx);
    const ah = 7;
    ctx.beginPath();
    ctx.moveTo(tip.sx, tip.sy);
    ctx.lineTo(tip.sx - ah * Math.cos(ang - 0.5), tip.sy - ah * Math.sin(ang - 0.5));
    ctx.lineTo(tip.sx - ah * Math.cos(ang + 0.5), tip.sy - ah * Math.sin(ang + 0.5));
    ctx.closePath();
    ctx.fillStyle = stroke;
    ctx.fill();
    ctx.font = 'italic bold 13px system-ui, sans-serif';
    ctx.fillStyle = stroke;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('c', tip.sx + 9 * dirx, tip.sy - 9 * diry);
  }
}

function draw2d(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  constraints: Constraint2d[],
  constraintStrings: string[],
  scene: Scene2d,
  dark: boolean,
  showAxes: boolean,
  activeLabels: ReadonlySet<string>,
  hoverVertex: number | null,
  objCoeff: Vec2 | null,
  objValue: number,
): void {
  ctx.clearRect(0, 0, w, h);

  if (scene.vertices.length === 0) {
    ctx.fillStyle = dark ? '#9ca3af' : '#6b7280';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Polytope is empty or unbounded', w / 2, h / 2);
    return;
  }

  const tf = makeTransform(scene, w, h);
  const anyHighlit = activeLabels.size > 0;

  // ── 1. Active half-plane fills ──────────────────────────────────────────────
  for (let ci = 0; ci < constraints.length; ci++) {
    if (activeLabels.has(constraintStrings[ci])) {
      fillHalfPlane(ctx, constraints[ci], tf, w, h, dark);
    }
  }

  // ── 2. Feasible region polygon ──────────────────────────────────────────────
  const { hull } = scene;
  if (hull.length >= 3) {
    const pts = hull.map(v => tf.worldToCanvas(v));
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
    ctx.closePath();

    const [fr, fg, fb] = dark ? [90, 160, 220] : [65, 125, 210];
    const polyAlpha = anyHighlit ? 0.18 : 0.30;
    ctx.fillStyle = `rgba(${fr},${fg},${fb},${polyAlpha})`;
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(180,215,255,0.75)' : 'rgba(20,60,150,0.65)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ── 3. Constraint lines ─────────────────────────────────────────────────────
  for (let ci = 0; ci < constraints.length; ci++) {
    const label = constraintStrings[ci];
    const isActive = activeLabels.has(label);
    const seg = clipLineToCanvas(constraints[ci], tf, w, h);
    if (!seg) continue;

    ctx.beginPath();
    ctx.moveTo(seg[0].sx, seg[0].sy);
    ctx.lineTo(seg[1].sx, seg[1].sy);

    if (isActive) {
      ctx.strokeStyle = dark ? 'rgba(251,191,36,0.90)' : 'rgba(180,100,0,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = dark ? 'rgba(200,200,200,0.30)' : 'rgba(100,100,100,0.30)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── 3b. Objective: swept region, level line, increase arrow ─────────────────
  if (objCoeff) {
    drawObjective(ctx, w, h, scene, tf, objCoeff, objValue, dark);
  }

  // ── 4. Axes ─────────────────────────────────────────────────────────────────
  if (showAxes) {
    const lo: Vec2 = [...scene.vertices[0]];
    const hi: Vec2 = [...scene.vertices[0]];
    for (const v of scene.vertices) {
      lo[0] = Math.min(lo[0], v[0]); hi[0] = Math.max(hi[0], v[0]);
      lo[1] = Math.min(lo[1], v[1]); hi[1] = Math.max(hi[1], v[1]);
    }

    for (let i = 0; i < 2; i++) {
      const axisStart: Vec2 = [0, 0];
      axisStart[i] = Math.min(0, lo[i]);
      const axisEnd: Vec2 = [0, 0];
      axisEnd[i] = hi[i] + 0.15 * (hi[i] - Math.min(0, lo[i]));

      const ps = tf.worldToCanvas(axisStart);
      const pe = tf.worldToCanvas(axisEnd);
      const dx = pe.sx - ps.sx;
      const dy = pe.sy - ps.sy;
      const dist = Math.hypot(dx, dy);
      if (dist < 3) continue;

      const color = AXIS_COLORS_2D[i];
      const ang = Math.atan2(dy, dx);

      // Axis line
      ctx.beginPath();
      ctx.moveTo(ps.sx, ps.sy);
      ctx.lineTo(pe.sx, pe.sy);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
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

      // Label
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(AXIS_LABELS_2D[i], pe.sx + 15 * Math.cos(ang), pe.sy + 15 * Math.sin(ang));

      // Ticks
      const axLo = axisStart[i];
      const step = niceTickStep(hi[i] - axLo);
      const n0 = Math.ceil(axLo / step - 1e-9);
      const n1 = Math.floor(hi[i] / step + 1e-9);

      // Perpendicular unit vector in canvas space (90° CCW from axis direction)
      const ax = dx / dist, ay = dy / dist;
      const px = -ay, py = ax;
      const TICK = 4;
      const LABEL_OFF = TICK + 7;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let n = n0; n <= n1; n++) {
        const t = n * step;
        if (Math.abs(t) < step * 1e-6) continue;
        const pt: Vec2 = [0, 0];
        pt[i] = t;
        const p = tf.worldToCanvas(pt);
        ctx.beginPath();
        ctx.moveTo(p.sx - px * TICK, p.sy - py * TICK);
        ctx.lineTo(p.sx + px * TICK, p.sy + py * TICK);
        ctx.stroke();
        ctx.fillText(fmtNum(t), p.sx + px * LABEL_OFF, p.sy + py * LABEL_OFF);
      }
    }

    // Origin dot
    const po = tf.worldToCanvas([0, 0]);
    ctx.beginPath();
    ctx.arc(po.sx, po.sy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#888';
    ctx.fill();
  }

  // ── 5. Vertex dots ──────────────────────────────────────────────────────────
  for (let i = 0; i < scene.vertices.length; i++) {
    const p = tf.worldToCanvas(scene.vertices[i]);
    const isHover = i === hoverVertex;
    const r = isHover ? 6.5 : 4.5;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fillStyle = dark ? (isHover ? '#ffffff' : 'rgba(255,255,255,0.85)') : (isHover ? '#ffffff' : 'rgba(255,255,255,0.9)');
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PolytopeViz2d({ constraints, objective, width = 480, height = 360, showAxes = true }: PolytopeViz2dProps) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const sceneRef      = useRef<Scene2d | null>(null);
  const constraintsRef = useRef<Constraint2d[]>([]);
  const constraintStringsRef = useRef<string[]>([]);
  const dprRef        = useRef(1);
  const showAxesRef   = useRef(showAxes);
  showAxesRef.current = showAxes;

  const activeLabelsRef  = useRef<Set<string>>(new Set());
  const [activeLabels, setActiveLabels] = useState<Set<string>>(new Set());
  const hoverVertexRef   = useRef<number | null>(null);

  // Objective state: reader-editable integer coefficients, swept value, slider range/step, optimum
  const objEnabled = objective != null;
  const objCoeffRef = useRef<Vec2 | null>(null);
  const objValueRef = useRef(0);
  const [coeffs, setCoeffs] = useState<[number, number]>(() => {
    const c = objective ? parseObjective2d(objective) : null;
    return c ? [Math.round(c[0]), Math.round(c[1])] : [1, 1];
  });
  const coeffsRef = useRef<[number, number]>(coeffs);
  const [objValue, setObjValue] = useState(0);
  const [objRange, setObjRange] = useState<[number, number]>([0, 1]);
  const [objStep, setObjStep] = useState(0.1);
  const [objOpt, setObjOpt] = useState<{ val: number; vertices: Vec2[] } | null>(null);

  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [constraintLabels, setConstraintLabels] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const helpWrapRef = useRef<HTMLDivElement>(null);

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
    draw2d(
      ctx, width, height,
      constraintsRef.current,
      constraintStringsRef.current,
      sceneRef.current,
      dark,
      showAxesRef.current,
      activeLabelsRef.current,
      hoverVertexRef.current,
      objCoeffRef.current,
      objValueRef.current,
    );
    ctx.restore();
  }, [width, height]);

  // ── Objective recompute ─────────────────────────────────────────────────────
  // Given a coefficient vector, find the objective's value range over the vertices,
  // pick a sweep step that lands on the optimum, and reset the slider.
  const recomputeObjective = useCallback((c: Vec2) => {
    const scene = sceneRef.current;
    const valid = c[0] !== 0 || c[1] !== 0;
    objCoeffRef.current = valid ? c : null;

    if (valid && scene && scene.vertices.length > 0) {
      let vMin = Infinity, vMax = -Infinity;
      for (const v of scene.vertices) {
        const val = v2dot(c, v);
        if (val < vMin) vMin = val;
        if (val > vMax) vMax = val;
      }
      const TOL = 1e-6;
      const argmax = scene.vertices.filter(v => v2dot(c, v) >= vMax - TOL);
      const baseStep = objectiveStep(vMax);
      const span = vMax - vMin;
      const pad  = Math.max(0.2 * span, 2 * baseStep);
      const lo   = Math.floor((vMin - pad) / baseStep) * baseStep;
      const hi   = Math.ceil((vMax + pad) / baseStep) * baseStep;
      // Ensure the sweep has at least 20 distinct levels. Dividing the base step
      // by an integer keeps every original tick (so the level line still lands
      // exactly on the optimum) while interleaving finer ones.
      const baseLevels = Math.max(1, Math.round((hi - lo) / baseStep));
      const refine = Math.max(1, Math.ceil(20 / baseLevels));
      const step = baseStep / refine;
      const mid  = lo + Math.round(((vMin + vMax) / 2 - lo) / step) * step;
      setObjRange([lo, hi]);
      setObjStep(step);
      setObjOpt({ val: vMax, vertices: argmax });
      objValueRef.current = mid;
      setObjValue(mid);
    } else {
      setObjOpt(null);
    }
    redraw();
  }, [redraw]);

  // ── Set up canvas DPR ─────────────────────────────────────────────────────

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

  // ── Parse constraints + build scene ──────────────────────────────────────

  useEffect(() => {
    const pairs = constraints
      .map(s => ({ s, c: parseConstraint2d(s) }))
      .filter((p): p is { s: string; c: Constraint2d } => p.c !== null);
    constraintsRef.current = pairs.map(p => p.c);
    constraintStringsRef.current = pairs.map(p => p.s);
    sceneRef.current = buildScene2d(pairs.map(p => p.c), width, height);
    setConstraintLabels(pairs.map(p => p.s));
    if (objEnabled) recomputeObjective(coeffsRef.current);
    else redraw();
  }, [constraints, objEnabled, recomputeObjective, redraw, width, height]);

  // Re-draw on dark-mode change
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', redraw);
    return () => mq.removeEventListener('change', redraw);
  }, [redraw]);

  // ── Hover hit-test for vertices (shows a coordinate tooltip) ───────────────

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const dispRect = canvasRef.current?.getBoundingClientRect();
    const scene = sceneRef.current;
    if (!scene || !dispRect || scene.vertices.length === 0) { setTooltip(null); return; }

    const dsx = dispRect.width  > 0 ? width  / dispRect.width  : 1;
    const dsy = dispRect.height > 0 ? height / dispRect.height : 1;
    const mx = (e.clientX - dispRect.left) * dsx;
    const my = (e.clientY - dispRect.top)  * dsy;

    const tf = makeTransform(scene, width, height);
    const RADIUS = 8;
    let bestDist = RADIUS, bestIdx = -1;
    for (let i = 0; i < scene.vertices.length; i++) {
      const p = tf.worldToCanvas(scene.vertices[i]);
      const d = Math.hypot(mx - p.sx, my - p.sy);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }

    const newHover = bestIdx >= 0 ? bestIdx : null;
    if (newHover !== hoverVertexRef.current) {
      hoverVertexRef.current = newHover;
      redraw();
    }

    if (bestIdx < 0) { setTooltip(null); return; }
    const v = scene.vertices[bestIdx];
    setTooltip({
      content: `(${fmtNum(v[0])}, ${fmtNum(v[1])})`,
      x: e.clientX - dispRect.left,
      y: e.clientY - dispRect.top,
    });
  }, [redraw, width, height]);

  const onConstraintClick = useCallback((label: string) => {
    const next = new Set(activeLabelsRef.current);
    if (next.has(label)) next.delete(label); else next.add(label);
    activeLabelsRef.current = next;
    setActiveLabels(new Set(next));
    redraw();
  }, [redraw]);

  const onCoeffChange = useCallback((idx: 0 | 1, raw: string) => {
    const parsed = Math.round(parseFloat(raw));
    const next: [number, number] = [coeffsRef.current[0], coeffsRef.current[1]];
    next[idx] = Number.isFinite(parsed) ? parsed : 0;
    coeffsRef.current = next;
    setCoeffs(next);
    recomputeObjective(next);
  }, [recomputeObjective]);

  // Stepper buttons (keyboard-free; the only way to reach negative coefficients
  // on mobile, where the numeric keypad often has no minus key).
  const stepCoeff = useCallback((idx: 0 | 1, delta: number) => {
    const next: [number, number] = [coeffsRef.current[0], coeffsRef.current[1]];
    next[idx] += delta;
    coeffsRef.current = next;
    setCoeffs(next);
    recomputeObjective(next);
  }, [recomputeObjective]);

  // Press-and-hold auto-repeat: step once immediately, then after a short delay
  // repeat at a steady interval until pointer release / leave / cancel.
  const holdRef = useRef<{ delay: ReturnType<typeof setTimeout> | null; repeat: ReturnType<typeof setInterval> | null }>({ delay: null, repeat: null });
  const stopHold = useCallback(() => {
    if (holdRef.current.delay) { clearTimeout(holdRef.current.delay); holdRef.current.delay = null; }
    if (holdRef.current.repeat) { clearInterval(holdRef.current.repeat); holdRef.current.repeat = null; }
  }, []);
  const startHold = useCallback((idx: 0 | 1, delta: number) => {
    stopHold();
    stepCoeff(idx, delta);
    holdRef.current.delay = setTimeout(() => {
      holdRef.current.repeat = setInterval(() => stepCoeff(idx, delta), 60);
    }, 300);
  }, [stepCoeff, stopHold]);
  // Clear any pending timers if the component unmounts mid-hold.
  useEffect(() => stopHold, [stopHold]);

  return (
    <div className="polytope-viz" style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        onPointerMove={onPointerMove}
        onPointerLeave={() => { setTooltip(null); hoverVertexRef.current = null; redraw(); }}
        style={{ display: 'block' }}
        aria-label="2D polytope visualization. Click a constraint below to highlight its half-plane."
        role="img"
      />
      {tooltip && (
        <div
          className="polytope-viz-tooltip"
          style={{ left: tooltip.x + 14, top: tooltip.y - 14 }}
        >
          {tooltip.content}
        </div>
      )}
      <div className="polytope-viz-controls">
        <div className="polytope-viz-help-wrap" ref={helpWrapRef}>
          <button
            className="polytope-viz-help"
            onClick={() => setShowHelp(v => !v)}
            type="button"
            aria-label="Show interaction help"
          >?</button>
          {showHelp && (
            <div className="polytope-viz-help-popup" role="tooltip">
              <div className="polytope-viz-help-row"><span>Hover vertex</span><span>Show coordinates</span></div>
              <div className="polytope-viz-help-row"><span>Click constraint</span><span>Toggle half-plane</span></div>
            </div>
          )}
        </div>
      </div>
      {objEnabled && (
        <div className="polytope-viz-objective">
          <div className="polytope-viz-obj-head">
            <span className="polytope-viz-obj-label">maximize</span>
            <input
              className="polytope-viz-obj-coeff"
              type="number"
              step={1}
              value={coeffs[0]}
              onChange={(e) => onCoeffChange(0, e.target.value)}
              aria-label="coefficient of x_1"
            />
            <span dangerouslySetInnerHTML={{ __html: renderObjective('x_1') }} />
            <span className="polytope-viz-obj-plus">+</span>
            <input
              className="polytope-viz-obj-coeff"
              type="number"
              step={1}
              value={coeffs[1]}
              onChange={(e) => onCoeffChange(1, e.target.value)}
              aria-label="coefficient of x_2"
            />
            <span dangerouslySetInnerHTML={{ __html: renderObjective('x_2') }} />
            <span className="polytope-viz-obj-val">{`= ${fmtNum(objValue)}`}</span>
          </div>
          <div className="polytope-viz-obj-steppers">
            <span className="polytope-viz-obj-stepper-group">
              <span dangerouslySetInnerHTML={{ __html: renderObjective('x_1') }} />
              <button
                type="button"
                className="polytope-viz-obj-step"
                onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); startHold(0, -1); }}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stepCoeff(0, -1); } }}
                onContextMenu={(e) => e.preventDefault()}
                aria-label="decrease coefficient of x_1"
              >−</button>
              <button
                type="button"
                className="polytope-viz-obj-step"
                onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); startHold(0, 1); }}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stepCoeff(0, 1); } }}
                onContextMenu={(e) => e.preventDefault()}
                aria-label="increase coefficient of x_1"
              >+</button>
            </span>
            <span className="polytope-viz-obj-stepper-group">
              <span dangerouslySetInnerHTML={{ __html: renderObjective('x_2') }} />
              <button
                type="button"
                className="polytope-viz-obj-step"
                onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); startHold(1, -1); }}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stepCoeff(1, -1); } }}
                onContextMenu={(e) => e.preventDefault()}
                aria-label="decrease coefficient of x_2"
              >−</button>
              <button
                type="button"
                className="polytope-viz-obj-step"
                onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); startHold(1, 1); }}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stepCoeff(1, 1); } }}
                onContextMenu={(e) => e.preventDefault()}
                aria-label="increase coefficient of x_2"
              >+</button>
            </span>
          </div>
          <input
            className="polytope-viz-obj-slider"
            type="range"
            min={objRange[0]}
            max={objRange[1]}
            step={objStep}
            value={objValue}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              objValueRef.current = v;
              setObjValue(v);
              redraw();
            }}
            aria-label="Objective value"
          />
          {objOpt && (
            <div className="polytope-viz-obj-opt">
              optimum {fmtNum(objOpt.val)} at {objOpt.vertices.map(v => `(${fmtNum(v[0])}, ${fmtNum(v[1])})`).join(', ')}
            </div>
          )}
        </div>
      )}
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
