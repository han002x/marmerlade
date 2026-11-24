import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import BrandMark from './BrandMark';
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

type SketchKind = DiagramEntity['kind'] | 'mermaid';

const SKETCH: Record<SketchKind, string[]> = {
  flowchart: [
    'M8 24Q8 20 12 20L38 19Q42 19 42 23L42 38Q42 42 38 42L12 43Q8 43 8 39Z',
    'M78 8Q78 5 82 5L108 4Q112 4 112 8L112 19Q112 22 108 22L82 23Q78 23 78 20Z',
    'M78 42Q78 39 82 39L108 38Q112 38 112 42L112 54Q112 57 108 57L82 58Q78 58 78 55Z',
    'M43 29Q60 28 76 15M70 14L76 15L73 21',
    'M43 35Q60 38 76 49M70 50L76 49L73 43',
  ],
  sequence: [
    'M12 6Q12 4 15 4L33 4Q36 4 36 7L36 13Q36 15 33 15L15 15Q12 15 12 13Z',
    'M84 6Q84 4 87 4L105 4Q108 4 108 7L108 13Q108 15 105 15L87 15Q84 15 84 13Z',
    'M24 16L24 60',
    'M96 16L96 60',
    'M25 29Q60 27 94 30M88 25L94 30L88 34',
    'M95 46Q60 48 26 45M32 41L26 45L32 50',
  ],
  mermaid: [
    'M32 8Q22 8 22 18L22 26Q22 32 14 32Q22 32 22 38L22 46Q22 56 32 56',
    'M88 8Q98 8 98 18L98 26Q98 32 106 32Q98 32 98 38L98 46Q98 56 88 56',
  ],
};

/** The Mermaid mark, as drawn in src/assets/mermaid.svg (491 x 491 box). */
const MERMAID_MARK =
  'M407.48 111.18c-71.893-3.077-137.907 41.158-162.4 108.82-24.493-67.662-90.507-111.897-162.4-108.82-2.395 57.049 24.897 111.452 72.06 143.64 24.168 16.599 38.61 44.131 38.53 73.45v50.86H296.9v-50.86c-.084-29.317 14.355-56.85 38.52-73.45 47.176-32.176 74.472-86.587 72.06-143.64Z';

function Sketch({ kind }: { kind: SketchKind }) {
  return (
    <svg className="mf-welcome-sketch" viewBox="0 0 120 64" aria-hidden="true">
      {SKETCH[kind].map((d, i) => (
        <path key={i} d={d} pathLength={1} style={{ animationDelay: `${i * 70}ms` }} />
      ))}
      {kind === 'mermaid' && <path className="mf-welcome-mark" d={MERMAID_MARK} transform="translate(18.4 -9.9) scale(0.17)" />}
    </svg>
  );
}

/**
 * First-run notes drawn over the canvas with optional diagram shortcuts.
 */
export function Welcome({ onDone, onAddDiagram, onPasteMermaid }: {
  onDone: () => void;
  onAddDiagram?: (kind: DiagramEntity['kind']) => void;
  onPasteMermaid?: () => void;
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
      const panel = document.querySelector('[aria-label="Open Mermaid panel"], #mf-right-panel .mf-panel-head')?.getBoundingClientRect();
      if (bar && panel) setRects({ bar, panel, vw: window.innerWidth });
    };
    measure();
    const watch = new ResizeObserver(measure);
    for (const el of document.querySelectorAll('.mf-toolbar, [aria-label="Open Mermaid panel"], #mf-right-panel .mf-panel-head')) watch.observe(el);
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
              <Sketch kind="flowchart" />
              Flowchart
            </button>
            <button type="button" onClick={() => startDiagram('sequence')}>
              <Sketch kind="sequence" />
              Sequence
            </button>
            {onPasteMermaid && (
              <button type="button" onClick={() => { dismiss(); onPasteMermaid(); }}>
                <Sketch kind="mermaid" />
                Paste Mermaid
              </button>
            )}
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
