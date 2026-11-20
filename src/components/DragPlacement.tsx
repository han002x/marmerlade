import './drag-placement.css';
import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { XYPosition } from '@xyflow/react';

export function DragPlacement({
  disabled,
  onDrop,
  previewLabel,
  children,
}: {
  disabled?: boolean;
  onDrop: (point: XYPosition) => void;
  previewLabel: string;
  children: ReactNode;
}) {
  const origin = useRef<{ id: number; point: XYPosition; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<XYPosition | null>(null);
  function cancel() {
    origin.current = null;
    setPreview(null);
  }
  function move(event: PointerEvent) {
    const start = origin.current;
    if (!start || start.id !== event.pointerId) return;
    const point = { x: event.clientX, y: event.clientY };
    if (Math.hypot(point.x - start.point.x, point.y - start.point.y) >= 4) start.moved = true;
    if (start.moved) {
      suppressClick.current = true;
      setPreview(point);
    }
  }
  return (
    <span
      className="drag-placement"
      onClickCapture={(event) => {
        if (suppressClick.current && event.detail) {
          event.preventDefault();
          event.stopPropagation();
        }
        suppressClick.current = false;
      }}
      onPointerDown={(event) => {
        if (disabled || !event.isPrimary || event.button !== 0) return;
        suppressClick.current = false;
        origin.current = { id: event.pointerId, point: { x: event.clientX, y: event.clientY }, moved: false };
        (event.target as Element).closest('button')?.setPointerCapture(event.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={(event) => {
        if (origin.current?.id !== event.pointerId) return;
        if (origin.current.moved) onDrop({ x: event.clientX, y: event.clientY });
        cancel();
      }}
      onLostPointerCapture={cancel}
      onPointerCancel={cancel}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && origin.current) {
          suppressClick.current = true;
          cancel();
        } else if (event.key === ' ' || event.key === 'Enter') suppressClick.current = false;
      }}
    >
      {children}
      {preview &&
        createPortal(
          <div aria-hidden className="drag-placement-preview" style={{ left: preview.x, top: preview.y }}>
            {previewLabel}
          </div>,
          document.body,
        )}
    </span>
  );
}
