// Quick previews for references. One listener per window: anything carrying
// `data-ref` (rendered links, canvas page/deck buttons) or `data-wikilink`
// (links in the rich editor) shows a RefCard after a short hover or on focus.

import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';
import { linkRefKey } from '../store';
import './refs.css';

const RefCard = lazy(() => import('./RefCard'));

/** A RefCard floating beside `anchor`. */
export function RefPopover({ anchor, refKey, placement = 'bottom-start', onClick }: {
  anchor: HTMLElement;
  refKey: string;
  placement?: Placement;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    const done = new AbortController();
    const side = placement.split('-')[0];
    const stop = autoUpdate(anchor, card, () => {
      void computePosition(anchor, card, {
        strategy: 'fixed',
        placement,
        middleware: [
          offset(8),
          flip({ fallbackPlacements: side === 'right' ? ['left-start', 'bottom-start'] : ['top-start', 'right-start', 'left-start'] }),
          shift({ padding: 8, crossAxis: true }),
        ],
      }).then(({ x, y }) => {
        if (!done.signal.aborted) Object.assign(card.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' });
      });
    });
    return () => { done.abort(); stop(); };
  }, [anchor, placement]);
  return createPortal(
    <div ref={ref} className={`ref-card${onClick ? ' ref-card-link' : ''}`} role="tooltip" style={{ visibility: 'hidden' }}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Suspense fallback={<p className="ref-empty">…</p>}><RefCard refKey={refKey} /></Suspense>
    </div>,
    document.body,
  );
}

/** Mount once per window. */
export default function RefHover() {
  const [shown, setShown] = useState<{ key: string; anchor: HTMLElement } | null>(null);
  const current = useRef(shown);
  useLayoutEffect(() => { current.current = shown; });

  useEffect(() => {
    const pending = { timer: 0 };
    const cancel = () => window.clearTimeout(pending.timer);
    const later = (run: () => void, ms: number) => { cancel(); pending.timer = window.setTimeout(run, ms); };
    const close = () => { cancel(); setShown(null); };
    const find = (target: EventTarget | null) => {
      const anchor = target instanceof Element ? target.closest<HTMLElement>('[data-ref], [data-wikilink]') : null;
      if (!anchor || anchor.closest('.ref-card, [data-ref-previews="off"], [inert]')) return null;
      const key = anchor.dataset.ref ?? linkRefKey(anchor.dataset.wikilink ?? '');
      return key ? { key, anchor } : null;
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.buttons) return;
      const hit = find(e.target);
      if (hit) {
        if (current.current?.anchor === hit.anchor) cancel();
        else later(() => setShown(hit), current.current ? 120 : 350);
      } else if (e.target instanceof Element && e.target.closest('.ref-card')) cancel();
      else if (current.current) later(() => setShown(null), 150);
      else cancel();
    };
    const focus = (e: FocusEvent) => {
      const hit = find(e.target);
      if (hit && (e.target as Element).matches(':focus-visible')) { cancel(); setShown(hit); }
    };
    const blur = () => { if (current.current) later(() => setShown(null), 150); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && current.current) close(); };
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof Element && e.target.closest('.ref-card'))) close();
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', blur);
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', down, true);
    window.addEventListener('hashchange', close);
    return () => {
      cancel();
      document.removeEventListener('pointerover', over);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', blur);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', down, true);
      window.removeEventListener('hashchange', close);
    };
  }, []);

  // the anchor can vanish under the card (a re-render, a deleted link)
  useEffect(() => {
    if (!shown) return;
    const check = window.setInterval(() => { if (!shown.anchor.isConnected) setShown(null); }, 300);
    return () => window.clearInterval(check);
  }, [shown]);

  if (!shown) return null;
  const follow = shown.anchor.matches('a[href], button') ? () => { shown.anchor.click(); setShown(null); } : undefined;
  return <RefPopover anchor={shown.anchor} refKey={shown.key} onClick={follow} />;
}
