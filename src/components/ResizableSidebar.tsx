import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 180;
const MAX_WIDTH = 600;

export default function ResizableSidebar({ id, children }: { id: string; children: ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const maxWidth = () => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - 320));
  const resize = (next: number) => setWidth(Math.min(maxWidth(), Math.max(MIN_WIDTH, next)));
  const style: CSSProperties & { '--wk-index-width': string } = { '--wk-index-width': `${width}px` };

  return <aside className="wk-index" id={id} style={style}>
    {children}
    <div className="wk-index-resize" role="separator" tabIndex={0} aria-label="Resize left panel"
      aria-orientation="vertical" aria-controls={id} aria-valuemin={MIN_WIDTH} aria-valuemax={maxWidth()}
      aria-valuenow={width} aria-valuetext={`${width} pixels`} title="Drag to resize · Double-click to reset"
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, width };
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (start?.pointerId === event.pointerId) resize(start.width + event.clientX - start.x);
      }}
      onPointerUp={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
      onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? 50 : 10;
        resize(event.key === 'Home' ? MIN_WIDTH : event.key === 'End' ? maxWidth()
          : width + (event.key === 'ArrowLeft' ? -step : step));
      }} />
  </aside>;
}
