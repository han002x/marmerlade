// A folded flowchart as one PowerPoint slide: pure geometry, no pptxgenjs.
//
// `buildScene` takes the same visible graph the canvas draws (`visibleGraph`),
// lays it out in slide inches, and returns plain items. `write.ts` turns the
// items into a file, so this module is testable without a browser or a zip.

import { groupOrigin, childrenOf, sheets, visibleGraph, type Rect } from '../fold.ts';
import { IMAGE_LABEL_SPACE, nodeSize } from '../layout.ts';
import { inkOn } from '../style.ts';
import { autoSides } from '../edgePath.ts';
import { DEFAULT_IMAGE_SIZE, type DiagramEdge, type DiagramNode, type FlowDirection, type FontFamily, type NodeShape, type Side } from '../types.ts';

/** 16:9 slide, in inches */
export const SLIDE_W = 13.333;
export const SLIDE_H = 7.5;
const MARGIN = 0.5;
/** inches per canvas pixel at most, so a tiny diagram is not blown up */
const MAX_SCALE = 1 / 64;
const MIN_FONT_PT = 6;
const MIN_LINE_PT = 0.75;

export interface Palette {
  bg: string;
  ink: string;
  node: string;
  group: string;
  text: string;
  border: string;
  /** the theme's content font, used where a node asks for the default */
  font: string;
}

export type Preset =
  | 'rect' | 'roundRect' | 'flowChartTerminator' | 'flowChartPredefinedProcess' | 'can' | 'ellipse'
  | 'diamond' | 'hexagon' | 'parallelogram' | 'trapezoid' | 'homePlate';

export interface Stroke { color: string; width: number; dash: 'solid' | 'dash' | 'sysDot' }
export interface Text {
  value: string; font: string; size: number; color: string;
  align: 'left' | 'center'; valign: 'top' | 'middle';
}

export type SceneItem =
  | {
    kind: 'shape'; preset: Preset; x: number; y: number; w: number; h: number;
    flipH?: boolean; flipV?: boolean; fill: string | null; transparency?: number;
    line: Stroke | null; radius?: number; text?: Text;
  }
  | { kind: 'text'; x: number; y: number; w: number; h: number; text: Text }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; line: Stroke; begin: boolean; end: boolean }
  | { kind: 'image'; x: number; y: number; w: number; h: number; src?: string; icon?: string; color?: string };

export interface Scene { width: number; height: number; background: string; items: SceneItem[] }

export interface SceneInput {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** rendered sizes in canvas px, for nodes that auto-size */
  sizes?: Record<string, { width: number; height: number }>;
  palette: Palette;
  /** flowchart direction, for the sides an unpinned edge joins by */
  direction?: FlowDirection;
}

const FONTS: Record<Exclude<FontFamily, 'hand'>, string> = { sans: 'Inter', serif: 'Georgia', mono: 'JetBrains Mono' };

/** `#rgb` / `#rrggbb` to `#rrggbb`; anything else (CSS variables, names) takes `fallback`. */
export function hex(value: string | undefined, fallback: string): string {
  const m = value?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return fallback;
  return `#${(m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]).toLowerCase()}`;
}

/** How each node outline maps onto a PowerPoint preset. `flag` is the nearest fit. */
export const PRESETS: Record<NodeShape, { preset: Preset; flipH?: boolean; flipV?: boolean }> = {
  rect: { preset: 'rect' },
  round: { preset: 'roundRect' },
  stadium: { preset: 'flowChartTerminator' },
  subroutine: { preset: 'flowChartPredefinedProcess' },
  cylinder: { preset: 'can' },
  circle: { preset: 'ellipse' },
  'dbl-circle': { preset: 'ellipse' },
  diamond: { preset: 'diamond' },
  hexagon: { preset: 'hexagon' },
  'lean-r': { preset: 'parallelogram' },
  'lean-l': { preset: 'parallelogram', flipH: true },
  'trap-b': { preset: 'trapezoid' },
  'trap-t': { preset: 'trapezoid', flipV: true },
  flag: { preset: 'homePlate', flipH: true },
};

const anchor = (r: Rect, side: Side) =>
  side === 'top' ? { x: r.x + r.width / 2, y: r.y }
    : side === 'bottom' ? { x: r.x + r.width / 2, y: r.y + r.height }
      : side === 'left' ? { x: r.x, y: r.y + r.height / 2 }
        : { x: r.x + r.width, y: r.y + r.height / 2 };


const dashOf = (style: string | undefined): Stroke['dash'] => (style === 'dashed' ? 'dash' : style === 'dotted' ? 'sysDot' : 'solid');

/** Everything in canvas px; `buildScene` scales it onto the slide at the end. */
export function buildScene({ nodes, edges, sizes = {}, palette, direction }: SceneInput): Scene {
  const graph = visibleGraph(nodes, edges);
  const kids = childrenOf(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const origin = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const o = kids.has(n.id) ? groupOrigin(n.id, nodes, kids) : null;
    if (o) origin.set(n.id, o);
  }
  const positionOf = (n: DiagramNode) => origin.get(n.id) ?? n.position;
  const sizeOf = (n: DiagramNode) => n.size ?? sizes[n.id] ?? nodeSize(n);
  const rectOf = (n: DiagramNode): Rect => ({ ...positionOf(n), ...sizeOf(n) });

  const fontFor = (n: { style?: DiagramNode['style'] }) => {
    const f = n.style?.fontFamily;
    return f && f !== 'hand' ? FONTS[f] : palette.font;
  };
  const text = (value: string, n: { style?: DiagramNode['style'] }, color: string, align: Text['align'] = 'center', valign: Text['valign'] = 'middle'): Text =>
    ({ value, font: fontFor(n), size: n.style?.fontSize ?? 13, color, align, valign });

  const items: SceneItem[] = [];
  const sheetRects = new Map<string, Rect>();

  // sheets first, outermost first, so nested ones stack on top
  for (const sh of sheets(nodes, graph.hidden, positionOf, sizeOf)) {
    sheetRects.set(sh.groupId, sh.rect);
    const g = byId.get(sh.groupId)!;
    items.push({
      kind: 'shape', preset: 'roundRect', ...box(sh.rect), fill: palette.group, radius: 0.04,
      line: { color: palette.border, width: 1, dash: 'solid' },
      text: g.label ? text(g.label, g, palette.text, 'left', 'top') : undefined,
    });
  }

  const rectFor = (id: string): Rect | null => {
    const sheet = sheetRects.get(id);
    if (sheet) return sheet;
    const n = byId.get(id);
    return n && !graph.offscreen.has(id) ? rectOf(n) : null;
  };

  // edges sit under the nodes, so a line never crosses a label
  const labels: SceneItem[] = [];
  const addEdge = (e: { id: string; source: string; target: string; label?: string; sourceSide?: Side; targetSide?: Side; style?: DiagramEdge['style'] }) => {
    const a = rectFor(e.source);
    const b = rectFor(e.target);
    if (!a || !b) return;
    const [fromSide, toSide] = autoSides(a, b, direction);
    const p = anchor(a, e.sourceSide ?? fromSide);
    const q = anchor(b, e.targetSide ?? toSide);
    const heads = e.style?.arrowheads ?? 'none';
    items.push({
      kind: 'line', x1: p.x, y1: p.y, x2: q.x, y2: q.y, begin: heads === 'start' || heads === 'both', end: heads === 'end' || heads === 'both',
      line: { color: hex(e.style?.stroke, palette.ink), width: e.style?.strokeWidth ?? 1, dash: dashOf(e.style?.strokeStyle) },
    });
    if (e.label) {
      const size = e.style?.fontSize ?? 12;
      const w = Math.max(24, e.label.length * size * 0.6 + 12);
      const h = size * 1.6;
      labels.push({
        kind: 'shape', preset: 'rect', x: (p.x + q.x) / 2 - w / 2, y: (p.y + q.y) / 2 - h / 2, w, h, fill: palette.bg, line: null,
        text: text(e.label, e, hex(e.style?.fontColor, palette.text)),
      });
    }
  };
  for (const e of graph.placed) addEdge(e);
  for (const e of graph.folded) addEdge(e);

  for (const n of nodes) {
    if (graph.offscreen.has(n.id)) continue;
    const r = rectOf(n);
    const st = n.style;
    const fill = st?.background === 'transparent' ? null : hex(st?.background, palette.node);
    const ink = hex(st?.stroke, palette.ink);
    const label = n.label || (kids.has(n.id) ? 'Untitled' : '');
    const color = hex(st?.fontColor, inkOn(st?.background) ?? palette.text);
    const line: Stroke = { color: ink, width: st?.strokeWidth ?? 1, dash: dashOf(st?.strokeStyle) };
    const transparency = st?.opacity != null ? Math.round((1 - st.opacity) * 100) : undefined;
    const tile = !!(n.icon || n.image);
    const map = n.image ? { preset: n.shape === 'circle' ? 'ellipse' as const : n.shape === 'round' ? 'roundRect' as const : 'rect' as const } : PRESETS[n.shape];

    if (n.collapsed && kids.has(n.id)) {
      // a folded card reads as a stack of paper behind it
      items.push({ kind: 'shape', preset: map.preset, x: r.x + 6, y: r.y + 6, w: r.width, h: r.height, fill, line });
    }
    const base = { kind: 'shape' as const, preset: map.preset, radius: map.preset === 'roundRect' ? 0.2 : undefined, flipH: 'flipH' in map ? map.flipH : undefined, flipV: 'flipV' in map ? map.flipV : undefined, ...box(r), fill, transparency, line };
    // PowerPoint turns the text of a vertically flipped shape upside down, so it rides in its own box
    const loose = tile || base.flipV;
    items.push(loose || !label ? base : { ...base, text: text(label, n, color) });
    if (!label) continue;
    if (n.image) {
      const w = n.image.w ?? DEFAULT_IMAGE_SIZE;
      const h = n.image.h ?? DEFAULT_IMAGE_SIZE;
      const top = n.image.pos === 't';
      const strip = IMAGE_LABEL_SPACE;
      items.push({ kind: 'image', src: n.image.src, x: r.x + (r.width - w) / 2, y: r.y + (top ? strip : (r.height - strip - h) / 2 + 4), w, h });
      items.push({ kind: 'text', x: r.x, y: top ? r.y : r.y + r.height - strip, w: r.width, h: strip, text: text(label, n, color) });
    } else if (n.icon) {
      const s = Math.min(40, r.height - 34);
      items.push({ kind: 'image', icon: n.icon, color: ink, x: r.x + (r.width - s) / 2, y: r.y + 8, w: s, h: s });
      items.push({ kind: 'text', x: r.x, y: r.y + r.height - 32, w: r.width, h: 28, text: text(label, n, color) });
    } else if (loose) {
      items.push({ kind: 'text', x: r.x, y: r.y, w: r.width, h: r.height, text: text(label, n, color) });
    }
  }
  items.push(...labels);
  return place(items, palette.bg);
}

/** One picture, as large as the slide allows. For diagrams that are not drawn as shapes. */
export function pictureScene(src: string, width: number, height: number, background: string): Scene {
  return place([{ kind: 'image', src, x: 0, y: 0, w: width, h: height }], background, Infinity);
}

const box = (r: Rect) => ({ x: r.x, y: r.y, w: r.width, h: r.height });

/** Scale and centre the px-space items on the slide. */
function place(items: SceneItem[], background: string, maxScale = MAX_SCALE): Scene {
  if (!items.length) throw new Error('Add diagram nodes before exporting a PowerPoint');
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const i of items) {
    if (i.kind === 'line') { grow(i.x1, i.y1); grow(i.x2, i.y2); } else { grow(i.x, i.y); grow(i.x + i.w, i.y + i.h); }
  }
  const bw = Math.max(1, x1 - x0);
  const bh = Math.max(1, y1 - y0);
  const k = Math.min((SLIDE_W - 2 * MARGIN) / bw, (SLIDE_H - 2 * MARGIN) / bh, maxScale);
  const ox = (SLIDE_W - bw * k) / 2 - x0 * k;
  const oy = (SLIDE_H - bh * k) / 2 - y0 * k;
  const X = (v: number) => ox + v * k;
  const Y = (v: number) => oy + v * k;
  const stroke = (s: Stroke): Stroke => ({ ...s, width: Math.max(MIN_LINE_PT, s.width * k * 72) });
  const type = (t: Text): Text => ({ ...t, size: Math.max(MIN_FONT_PT, Math.round(t.size * k * 72 * 10) / 10) });
  const out = items.map((i): SceneItem => {
    switch (i.kind) {
      case 'line': return { ...i, x1: X(i.x1), y1: Y(i.y1), x2: X(i.x2), y2: Y(i.y2), line: stroke(i.line) };
      case 'text': return { ...i, x: X(i.x), y: Y(i.y), w: i.w * k, h: i.h * k, text: type(i.text) };
      case 'image': return { ...i, x: X(i.x), y: Y(i.y), w: i.w * k, h: i.h * k };
      case 'shape': return {
        ...i, x: X(i.x), y: Y(i.y), w: i.w * k, h: i.h * k,
        line: i.line && stroke(i.line), text: i.text && type(i.text),
        radius: i.radius,
      };
    }
  });
  return { width: SLIDE_W, height: SLIDE_H, background, items: out };
}
