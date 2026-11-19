import { useEffect, useRef, type PointerEvent } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import { boundsOf, resizeHandles, resizeSelection, type Guide, type ResizeHandle } from '../canvasTransform';
import type { Rect } from '../fold';

export type ResizePreview = ReturnType<typeof resizeSelection>;

type Gesture = {
  pointerId: number;
  start: Pick<Rect, 'x' | 'y'>;
  geometry: Omit<Parameters<typeof resizeSelection>[0], 'delta' | 'zoom'>;
  commit: (rects: ResizePreview['rects']) => void;
  selection: string[];
};

export function NodeTransforms({ nodes, selected, preview, moveGuides, onPreview, onCommit, disabled }: {
  nodes: ReadonlyMap<string, Rect>;
  selected: string[];
  preview: ResizePreview | null;
  moveGuides: Guide[];
  onPreview: (preview: ResizePreview | null) => void;
  onCommit: Gesture['commit'];
  disabled: boolean;
}) {
  const [x, y, zoom] = useStore((s) => s.transform);
  const selecting = useStore((s) => s.userSelectionActive);
  const canDrag = useStore((s) => s.nodesDraggable);
  const { screenToFlowPosition } = useReactFlow();
  const gesture = useRef<Gesture | null>(null);
  const inactive = disabled || !canDrag;

  useEffect(() => {
    const active = gesture.current;
    if (active && (inactive || selected !== active.selection || onCommit !== active.commit)) {
      gesture.current = null;
      onPreview(null);
    }
  }, [inactive, selected, onCommit, onPreview]);

  const members = new Map<string, Rect>();
  for (const id of selected) {
    const rect = nodes.get(id);
    if (rect) members.set(id, rect);
  }
  const bounds = boundsOf([...members.values()]);
  const shown = boundsOf([...(preview?.rects.size ? preview.rects : members).values()]);
  const others = () => [...nodes].filter(([id]) => !members.has(id)).map(([, rect]) => rect);
  const point = (e: PointerEvent) => screenToFlowPosition({ x: e.clientX, y: e.clientY });

  const begin = (e: PointerEvent<HTMLButtonElement>, handle: ResizeHandle) => {
    if (e.button !== 0 || !e.isPrimary || !bounds || gesture.current) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      pointerId: e.pointerId,
      start: point(e),
      geometry: { bounds, selected: members, others: others(), handle },
      commit: onCommit,
      selection: selected,
    };
  };

  const update = (e: PointerEvent<HTMLButtonElement>, active: Gesture) => {
    const now = point(e);
    return resizeSelection({
      ...active.geometry, zoom,
      delta: { x: now.x - active.start.x, y: now.y - active.start.y },
    });
  };

  const end = (e: PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const active = gesture.current;
    if (active?.pointerId !== e.pointerId) return;
    gesture.current = null;
    onPreview(null);
    if (commit) active.commit(update(e, active).rects);
  };

  const guides = preview?.guides ?? moveGuides;
  const showHandles = shown && !inactive && !selecting;
  return (
    <div className="mf-transforms">
      {guides.map((guide) => (
        <div key={guide.axis} className="mf-snap-guide" aria-hidden="true" style={guide.axis === 'x'
          ? { left: x + guide.at * zoom, top: y + guide.from * zoom, height: (guide.to - guide.from) * zoom }
          : { left: x + guide.from * zoom, top: y + guide.at * zoom, width: (guide.to - guide.from) * zoom }} />
      ))}
      {showHandles && (
        <div className="mf-transform-box" style={{
          left: x + shown.x * zoom, top: y + shown.y * zoom, width: shown.width * zoom, height: shown.height * zoom,
        }}>
          {resizeHandles.map((handle) => (
            <button key={handle.label} type="button" className="mf-transform-point"
              aria-label={`Resize ${handle.label}`} title={`Resize ${handle.label}`}
              style={{ left: `${(handle.x + 1) * 50}%`, top: `${(handle.y + 1) * 50}%`, cursor: handle.cursor,
                marginLeft: 9 * handle.x, marginTop: (handle.x === 0 ? 15 : 9) * handle.y }}
              onPointerDown={(e) => begin(e, handle)}
              onPointerMove={(e) => {
                const active = gesture.current;
                if (active?.pointerId === e.pointerId) onPreview(update(e, active));
              }}
              onPointerUp={(e) => end(e, true)}
              onPointerCancel={(e) => end(e, false)}
              onLostPointerCapture={(e) => end(e, false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && gesture.current) {
                  gesture.current = null;
                  onPreview(null);
                  e.stopPropagation();
                  return;
                }
                if (!bounds || gesture.current) return;
                const step = (e.shiftKey ? 24 : 8) / zoom;
                const dx = handle.x && (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0);
                const dy = handle.y && (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
                if (!dx && !dy) return;
                e.preventDefault();
                e.stopPropagation();
                onCommit(resizeSelection({ bounds, selected: members, others: [], handle, delta: { x: dx, y: dy }, zoom }).rects);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
