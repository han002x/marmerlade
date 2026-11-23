import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import BrandMark from './BrandMark';
import { Icon } from './Icon';
import type { FitViewOptions } from '@xyflow/react';
import type { DiagramEntity } from '../types';
const KEY = 'marmerlade.welcomed';

/** Fired to show the first-run notes again (e.g. after Clear canvas). */
export const WELCOME_EVENT = 'marmerlade:welcome';

/** Frames the demo diagram below the notes. */
export const FIRST_RUN_FIT: FitViewOptions = {
  padding: { top: '350px', right: '80px', bottom: '60px', left: '80px' },
  maxZoom: 1,
};

/** True until the first-run notes have been dismissed once. */
export function isFirstRun(): boolean {
  try {
    return !localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

function markWelcomed() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // best-effort
  }
}

interface Pt {
  x: number;
  y: number;
}
interface Rects {
  bar: DOMRect;
  panel: DOMRect;
  vw: number;
}

/** A hand-drawn arrow: two slightly different curves and a two-stroke head. */
function arrow(from: Pt, to: Pt, bend: number): string[] {
  const curve = (a: Pt, b: Pt, k: number) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const c = { x: (a.x + b.x) / 2 - (dy / len) * k, y: (a.y + b.y) / 2 + (dx / len) * k };
    return { c, d: `M${a.x} ${a.y}Q${c.x} ${c.y} ${b.x} ${b.y}` };
  };
  const main = curve(from, to, bend);
  const echo = curve({ x: from.x + 3, y: from.y - 2 }, { x: to.x - 2, y: to.y + 2 }, bend * 1.25);
  const tip = Math.atan2(to.y - main.c.y, to.x - main.c.x);
  const wing = (turn: number) =>
    `M${to.x} ${to.y}L${to.x - Math.cos(tip + turn) * 15} ${to.y - Math.sin(tip + turn) * 15}`;
  return [main.d, echo.d, wing(0.5), wing(-0.5)];
}

/**
 * First-run notes drawn over the canvas with optional diagram shortcuts.
 */
export function Welcome({ onDone, onAddDiagram }: {
  onDone: () => void;
  onAddDiagram?: (kind: DiagramEntity['kind']) => void;
}) {
  const [rects, setRects] = useState<Rects | null>(null);
  const [leaving, setLeaving] = useState(false);
  const actions = useRef<HTMLDivElement>(null);
  const dismiss = useCallback(() => {
    markWelcomed();
    setLeaving(true);
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const bar = document.querySelector('.mf-toolbar')?.getBoundingClientRect();
      const panel = document.querySelector('.mf-reopen, .mf-panel-head')?.getBoundingClientRect();
      if (bar && panel) setRects({ bar, panel, vw: window.innerWidth });
    };
    measure();
    const watch = new ResizeObserver(measure);
    for (const el of document.querySelectorAll('.mf-toolbar, .mf-reopen, .mf-panel-head')) watch.observe(el);
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    return () => {
      watch.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    if (leaving) {
      const timer = window.setTimeout(onDone, 220);
      return () => window.clearTimeout(timer);
    }
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && actions.current?.contains(event.target)) return;
      if (event instanceof KeyboardEvent && (event.key === 'Tab' || event.key === 'Shift')) return;
      dismiss();
    };
    window.addEventListener('pointerdown', dismissOutside, true);
    window.addEventListener('keydown', dismissOutside, true);
    return () => {
      window.removeEventListener('pointerdown', dismissOutside, true);
      window.removeEventListener('keydown', dismissOutside, true);
    };
  }, [dismiss, leaving, onDone]);

  function startDiagram(kind: DiagramEntity['kind']) {
    dismiss();
    onAddDiagram?.(kind);
  }

  if (!rects) return null;
  const { bar, panel, vw } = rects;
  const left = { x: Math.max(24, bar.left), y: bar.bottom + 96 };
  const right = { x: vw - 24, y: panel.bottom + 96 };
  const toolbarArrow = arrow(
    { x: left.x + 70, y: left.y - 10 },
    { x: bar.left + bar.width * 0.3, y: bar.bottom + 10 },
    -34,
  );
  const panelArrow = arrow(
    { x: right.x - 90, y: right.y - 10 },
    { x: panel.left + panel.width / 2, y: panel.bottom + 10 },
    34,
  );

  return (
    <div className={leaving ? 'mf-welcome is-leaving' : 'mf-welcome'}>
      <svg className="mf-welcome-ink" aria-hidden="true">
        {[toolbarArrow, panelArrow].map((paths, i) =>
          paths.map((d, j) => (
            <path
              key={`${i}-${j}`}
              d={d}
              pathLength={1}
              className={j === 1 ? 'is-echo' : undefined}
              style={{ animationDelay: `${i * 260 + (j > 1 ? 700 : j * 120)}ms` }}
            />
          )),
        )}
      </svg>
      <div className="mf-welcome-content" style={{ top: bar.bottom + 160 }}>
        <div className="mf-welcome-brand" aria-hidden="true">
          <BrandMark size={64} decorative />
          <span className="mf-brand">mar<span className="brand-initial">m</span>erlade</span>
        </div>
        {onAddDiagram && (
          <div className="mf-welcome-actions" ref={actions} inert={leaving}>
            <button type="button" onClick={() => startDiagram('flowchart')}>
              <Icon name="flowchart" />
              Add flowchart
            </button>
            <button type="button" onClick={() => startDiagram('sequence')}>
              <Icon name="sequence" />
              Add sequenceDiagram
            </button>
          </div>
        )}
      </div>
      <p className="mf-welcome-note" style={{ left: left.x, top: left.y }} aria-hidden="true">
        Add a diagram, play, export
      </p>
      <p className="mf-welcome-note is-right" style={{ right: vw - right.x, top: right.y }} aria-hidden="true">
        Mermaid, tree, pages, slides
        <kbd>Space</kbd>
      </p>
    </div>
  );
}
