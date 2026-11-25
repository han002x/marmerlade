// SVG path for an edge that follows a laid-out route, drawn the way Mermaid
// draws its own: a uniform B-spline through the bends (d3's curveBasis), which
// starts and ends exactly on the end points and bends smoothly in between.

import type { FlowDirection, Side } from './types.ts';

type Point = { x: number; y: number };

const fmt = (n: number) => Math.round(n * 100) / 100;

/**
 * The path from `start` through `bends` to `end`, and where its label sits:
 * halfway along the route.
 */
export function routedPath(start: Point, bends: Point[], end: Point): [path: string, labelX: number, labelY: number] {
  const pts = [start, ...bends, end];
  const [labelX, labelY] = halfway(pts);
  if (pts.length === 2) return [`M${fmt(start.x)},${fmt(start.y)}L${fmt(end.x)},${fmt(end.y)}`, labelX, labelY];

  // d3-shape curveBasis, unrolled: the first segment is a straight lead-in to
  // the first knot, then one cubic per point, then a closing cubic and line
  let d = `M${fmt(pts[0].x)},${fmt(pts[0].y)}`;
  const cubic = (p0: Point, p1: Point, p: Point) => {
    d +=
      `C${fmt((2 * p0.x + p1.x) / 3)},${fmt((2 * p0.y + p1.y) / 3)}` +
      ` ${fmt((p0.x + 2 * p1.x) / 3)},${fmt((p0.y + 2 * p1.y) / 3)}` +
      ` ${fmt((p0.x + 4 * p1.x + p.x) / 6)},${fmt((p0.y + 4 * p1.y + p.y) / 6)}`;
  };
  d += `L${fmt((5 * pts[0].x + pts[1].x) / 6)},${fmt((5 * pts[0].y + pts[1].y) / 6)}`;
  for (let i = 2; i < pts.length; i++) cubic(pts[i - 2], pts[i - 1], pts[i]);
  const last = pts[pts.length - 1];
  cubic(pts[pts.length - 2], last, last);
  d += `L${fmt(last.x)},${fmt(last.y)}`;
  return [d, labelX, labelY];
}

/** The point halfway along a polyline, measured by length. */
function halfway(pts: Point[]): [number, number] {
  const lengths = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  let left = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] && lengths[i] > 0) {
      const t = left / lengths[i];
      return [pts[i].x + (pts[i + 1].x - pts[i].x) * t, pts[i].y + (pts[i + 1].y - pts[i].y) * t];
    }
    left -= lengths[i];
  }
  return [pts[0].x, pts[0].y];
}

export type Box = { x: number; y: number; width: number; height: number };

/**
 * Where the line from the centre of `box` toward `toward` crosses the node's
 * outline: the box for most shapes, the rhombus of a diamond, the ellipse of a
 * circle. A routed edge starts and ends there, so edges fan out around a node
 * the way Mermaid draws them instead of meeting at one handle.
 */
export function borderPoint(box: Box, shape: string | undefined, toward: Point): Point {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  const w = box.width / 2;
  const h = box.height / 2;
  if ((dx === 0 && dy === 0) || w <= 0 || h <= 0) return { x: cx, y: cy + h };
  let t: number;
  if (shape === 'diamond') t = 1 / (Math.abs(dx) / w + Math.abs(dy) / h);
  else if (shape === 'circle' || shape === 'dbl-circle') t = 1 / Math.hypot(dx / w, dy / h);
  else t = 1 / Math.max(Math.abs(dx) / w, Math.abs(dy) / h);
  // a bend inside the outline (nodes resized since Tidy) keeps the end on it
  return { x: cx + dx * t, y: cy + dy * t };
}

/**
 * The sides two boxes face each other by, for an edge with no side pinned: the
 * axis with the wider clear gap between them (so wide nodes stacked a little
 * off-centre still join bottom to top), the flow direction breaking a tie.
 */
export function autoSides(a: Box, b: Box, direction: FlowDirection = 'TB'): [Side, Side] {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2);
  const dy = b.y + b.height / 2 - (a.y + a.height / 2);
  const gapX = Math.abs(dx) - (a.width + b.width) / 2;
  const gapY = Math.abs(dy) - (a.height + b.height) / 2;
  const horizontal = gapX === gapY ? direction === 'LR' : gapX > gapY;
  if (horizontal) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}
