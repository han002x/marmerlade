import { unionRects, type Rect } from './fold';

type Point = Pick<Rect, 'x' | 'y'>;
type Axis = keyof Point;
export type Guide = { axis: Axis; at: number; from: number; to: number };

export type ResizeHandle = {
  label: string;
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
  cursor: 'nwse-resize' | 'ns-resize' | 'nesw-resize' | 'ew-resize';
};

export const resizeHandles: readonly ResizeHandle[] = [
  { label: 'top left', x: -1, y: -1, cursor: 'nwse-resize' },
  { label: 'top', x: 0, y: -1, cursor: 'ns-resize' },
  { label: 'top right', x: 1, y: -1, cursor: 'nesw-resize' },
  { label: 'left', x: -1, y: 0, cursor: 'ew-resize' },
  { label: 'right', x: 1, y: 0, cursor: 'ew-resize' },
  { label: 'bottom left', x: -1, y: 1, cursor: 'nesw-resize' },
  { label: 'bottom', x: 0, y: 1, cursor: 'ns-resize' },
  { label: 'bottom right', x: 1, y: 1, cursor: 'nwse-resize' },
];

export function boundsOf(rects: Rect[]) {
  return rects.length ? rects.reduce(unionRects) : null;
}

const snapDistance = 6; // screen pixels
const anchors = (start: number, length: number) => [start, start + length / 2, start + length];
const span = (rect: Rect, axis: Axis) => axis === 'x' ? rect.width : rect.height;

function nearestSnap(axis: Axis, own: number[], others: Rect[], distance: number, accepts = (_at: number) => true) {
  let best: { at: number; shift: number; target: Rect } | undefined;
  for (const target of others) {
    for (const at of anchors(target[axis], span(target, axis))) {
      if (!accepts(at)) continue;
      for (const current of own) {
        const shift = at - current;
        if (Math.abs(shift) <= distance && (!best || Math.abs(shift) < Math.abs(best.shift))) {
          best = { at, shift, target };
        }
      }
    }
  }
  return best;
}

function alignmentGuide(axis: Axis, own: Rect, snap: { at: number; target: Rect }): Guide {
  const across = axis === 'x' ? 'y' : 'x';
  return {
    axis,
    at: snap.at,
    from: Math.min(own[across], snap.target[across]),
    to: Math.max(own[across] + span(own, across), snap.target[across] + span(snap.target, across)),
  };
}

export function snapMove(bounds: Rect, others: Rect[], zoom: number) {
  const distance = snapDistance / zoom;
  const x = nearestSnap('x', anchors(bounds.x, bounds.width), others, distance);
  const y = nearestSnap('y', anchors(bounds.y, bounds.height), others, distance);
  const offset = { x: x?.shift ?? 0, y: y?.shift ?? 0 };
  const moved = { ...bounds, x: bounds.x + offset.x, y: bounds.y + offset.y };
  const guides = [];
  if (x) guides.push(alignmentGuide('x', moved, x));
  if (y) guides.push(alignmentGuide('y', moved, y));
  return { offset, guides };
}

export function resizeSelection({ bounds, selected, others, handle, delta, zoom }: {
  bounds: Rect;
  selected: ReadonlyMap<string, Rect>;
  others: Rect[];
  handle: ResizeHandle;
  delta: Point;
  zoom: number;
}) {
  const rects = new Map<string, Rect>();
  const guides: Guide[] = [];
  if ((!handle.x || !delta.x) && (!handle.y || !delta.y)) return { rects, guides };

  let minScale = 0;
  for (const node of selected.values()) {
    if (handle.y) minScale = Math.max(minScale, Math.min(1, 32 / node.height));
    if (handle.x) minScale = Math.max(minScale, Math.min(1, 48 / node.width));
  }

  const anchorX = bounds.x + (handle.x < 0 ? bounds.width : 0);
  const anchorY = bounds.y + (handle.y < 0 ? bounds.height : 0);
  const dx = handle.x * bounds.width;
  const dy = handle.y * bounds.height;
  // Project onto the diagonal for corners and onto one axis for edge handles.
  const length = Math.hypot(dx, dy);
  let scale = Math.max(minScale, 1 + (delta.x * dx + delta.y * dy) / (length * length));
  const distance = snapDistance / zoom;
  const snapX = dx ? nearestSnap('x', [anchorX + dx * scale], others, distance * Math.abs(dx) / length,
    (at) => (at - anchorX) / dx >= minScale) : undefined;
  const snapY = dy ? nearestSnap('y', [anchorY + dy * scale], others, distance * Math.abs(dy) / length,
    (at) => (at - anchorY) / dy >= minScale) : undefined;

  if (snapX && (!snapY || Math.abs(snapX.shift / dx) <= Math.abs(snapY.shift / dy))) scale = (snapX.at - anchorX) / dx;
  else if (snapY) scale = (snapY.at - anchorY) / dy;

  const widthScale = handle.x ? scale : 1;
  const heightScale = handle.y ? scale : 1;
  const transform = (rect: Rect): Rect => ({
    x: rect.x + (rect.x - anchorX) * (widthScale - 1),
    y: rect.y + (rect.y - anchorY) * (heightScale - 1),
    width: rect.width * widthScale,
    height: rect.height * heightScale,
  });
  const resized = transform(bounds);
  const epsilon = 0.001;
  if (snapX && Math.abs(anchorX + dx * scale - snapX.at) < epsilon) guides.push(alignmentGuide('x', resized, snapX));
  if (snapY && Math.abs(anchorY + dy * scale - snapY.at) < epsilon) guides.push(alignmentGuide('y', resized, snapY));
  if (Math.abs(scale - 1) > 1e-9) {
    for (const [id, rect] of selected) rects.set(id, transform(rect));
  }
  return { rects, guides };
}
