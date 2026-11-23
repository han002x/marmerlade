import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { computePosition, flip, shift } from '@floating-ui/dom';

export default function ContextMenu({ label, children, items }: {
  label: string;
  children: ReactNode;
  items: ReactNode;
}) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!point || !menu.current) return;
    const element = menu.current;
    const anchor = { getBoundingClientRect: () => new DOMRect(point.x, point.y, 0, 0) };
    void computePosition(anchor, element, { strategy: 'fixed', placement: 'bottom-start', middleware: [flip(), shift({ padding: 8 })] })
      .then(({ x, y }) => { element.style.left = `${x}px`; element.style.top = `${y}px`; });
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [point]);

  useEffect(() => {
    if (!point) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      setPoint(null);
    };
    const scroll = () => setPoint(null);
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('scroll', scroll, true); };
  }, [point]);

  return <div style={{ display: 'contents' }} onContextMenu={event => {
    event.preventDefault();
    event.stopPropagation();
    trigger.current = event.target instanceof HTMLElement ? event.target : null;
    setPoint({ x: event.clientX, y: event.clientY });
  }}>
    {children}
    {point && createPortal(<div ref={menu} className="wk-menu" role="menu" aria-label={label}
      onClick={event => {
        if (event.target instanceof Element && event.target.closest('[role^="menuitem"]')) setPoint(null);
      }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); setPoint(null); trigger.current?.focus(); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        if (!buttons.length) return;
        const at = buttons.findIndex(button => button === document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
          (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>{items}</div>, document.body)}
  </div>;
}
