// Tidy that matches the preview. A diagram that is not open is drawn by
// Mermaid itself (see DiagramFrame); this renders the very same SVG, reads
// where Mermaid put each node, how big it drew it, the path of each edge and
// the spot of each label, and hands those back as canvas positions, sizes and
// routes. Opening the diagram then shows the layout its preview showed.

import { diagramSvg } from './svg';
import { toMermaid } from './io';
import { activeAppearance } from '../theme';
import { nodeSize } from '../layout';
import type { Diagram, DiagramEdge, DiagramNode, EdgeRoute, FlowDirection, Side } from '../types';

type Point = { x: number; y: number };
type Rect = { cx: number; cy: number; width: number; height: number };

/** The nodes and edges laid out as the preview draws them. */
export async function previewLayout(diagram: Diagram): Promise<{ nodes: DiagramNode[]; edges: DiagramEdge[] }> {
  const direction: FlowDirection = diagram.direction ?? 'TB';
  // the same text and appearance the preview renders, so the SVG is the same one
  const source = toMermaid({ nodes: diagram.nodes, edges: diagram.edges, direction });
  const svg = await diagramSvg(source, activeAppearance());
  const { boxes, paths, labels } = measure(svg);

  const groups = new Set(diagram.nodes.flatMap((n) => (n.parentId ? [n.parentId] : [])));
  const nodes = diagram.nodes.map((n) => {
    const box = boxes.get(n.id);
    if (!box || groups.has(n.id)) return n;
    // images and icons keep their own size; everything else takes Mermaid's
    const keep = !!(n.image || n.icon);
    const size = keep ? nodeSize(n) : { width: Math.round(box.width), height: Math.round(box.height) };
    return {
      ...n,
      ...(!keep && { size }),
      position: { x: box.cx - size.width / 2, y: box.cy - size.height / 2 },
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Mermaid names an edge L_<from>_<to>_<n>, counting repeats of a pair
  const seen = new Map<string, number>();
  const edges = diagram.edges.map((e) => {
    const pair = `${e.source}_${e.target}`;
    const n = seen.get(pair) ?? 0;
    seen.set(pair, n + 1);
    const { route: _old, ...edge } = e;
    void _old;
    const points = paths.get(`L_${pair}_${n}`);
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    const from = boxes.get(e.source);
    const to = boxes.get(e.target);
    // an edge into a subgraph ends on a sheet, which has no route to follow
    if (!points || points.length < 2 || !a || !b || !from || !to || groups.has(e.source) || groups.has(e.target)) return edge;
    const label = e.label ? labels.get(`L_${pair}_${n}`) : undefined;
    const route: EdgeRoute = {
      sourceSide: sideOf(from, points[0], direction),
      targetSide: sideOf(to, points[points.length - 1], direction),
      points: points.slice(1, -1),
      from: a.position,
      to: b.position,
      ...(label && { label }),
    };
    return { ...edge, route };
  });
  return { nodes, edges };
}

/** Which side of a node a route end leaves or enters by, across the ranks. */
function sideOf(box: Rect, p: Point, direction: FlowDirection): Side {
  if (direction === 'LR') return p.x < box.cx ? 'left' : 'right';
  return p.y < box.cy ? 'top' : 'bottom';
}

/** Read node boxes, edge paths and label centres out of a rendered flowchart SVG. */
function measure(svgText: string) {
  const host = document.createElement('div');
  // laid out but unseen: SVG geometry needs a rendered (not display:none) tree
  host.style.cssText = 'position:absolute;top:0;left:-100000px;visibility:hidden;width:100000px';
  host.innerHTML = svgText;
  document.body.appendChild(host);
  try {
    const root = host.querySelector('svg');
    if (!root) throw new Error('Mermaid drew no SVG');
    // draw at the viewBox's own scale so screen units are diagram units
    const vb = root.viewBox.baseVal;
    root.removeAttribute('style');
    root.setAttribute('width', String(vb.width));
    root.setAttribute('height', String(vb.height));
    const toRoot = (el: SVGGraphicsElement) => {
      const m = root.getScreenCTM()?.inverse().multiply(el.getScreenCTM() ?? new DOMMatrix());
      return (p: Point) => {
        const q = new DOMPoint(p.x, p.y).matrixTransform(m);
        return { x: q.x, y: q.y };
      };
    };

    const prefix = `${root.id}-flowchart-`;
    const boxes = new Map<string, Rect>();
    for (const g of root.querySelectorAll<SVGGElement>('g.node, g.rough-node')) {
      if (!g.id.startsWith(prefix)) continue;
      const id = g.id.slice(prefix.length).replace(/-\d+$/, '');
      const b = g.getBBox();
      const map = toRoot(g);
      const tl = map({ x: b.x, y: b.y });
      const br = map({ x: b.x + b.width, y: b.y + b.height });
      boxes.set(id, { cx: (tl.x + br.x) / 2, cy: (tl.y + br.y) / 2, width: br.x - tl.x, height: br.y - tl.y });
    }

    const paths = new Map<string, Point[]>();
    for (const path of root.querySelectorAll<SVGPathElement>('path[data-id][data-points]')) {
      try {
        const raw = JSON.parse(atob(path.dataset.points ?? '')) as Point[];
        const map = toRoot(path);
        const points = raw.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).map(map);
        paths.set(path.dataset.id ?? '', points);
      } catch {
        // an edge without readable points keeps no route
      }
    }

    const labels = new Map<string, Point>();
    for (const inner of root.querySelectorAll<SVGGElement>('g.edgeLabel [data-id]')) {
      const g = inner.closest<SVGGElement>('g.edgeLabel');
      if (!g || !g.textContent?.trim()) continue;
      const b = g.getBBox();
      const map = toRoot(g);
      const tl = map({ x: b.x, y: b.y });
      const br = map({ x: b.x + b.width, y: b.y + b.height });
      labels.set(inner.dataset.id ?? '', { x: (tl.x + br.x) / 2, y: (tl.y + br.y) / 2 });
    }
    return { boxes, paths, labels };
  } finally {
    host.remove();
  }
}
