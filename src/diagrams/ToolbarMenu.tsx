import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import { Icon, type IconName } from '../components/Icon';
import { ToolButton } from '../components/ToolButton';

export function ToolbarMenu({
  label,
  icon,
  children,
  viewportBounded = false,
  alignToPageLeft = false,
}: {
  label: string;
  icon: IconName;
  children: (close: () => void) => ReactNode;
  viewportBounded?: boolean;
  alignToPageLeft?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const anchor = root.current?.querySelector('button');
    const element = menu.current;
    if (!open || !viewportBounded || !anchor || !element) return;
    let active = true;
    const stop = autoUpdate(anchor, element, () => {
      void computePosition(anchor, element, {
        strategy: 'fixed',
        placement: 'bottom-start',
        middleware: [offset(8), flip(), shift({ padding: 8, crossAxis: true })],
      }).then(({ x, y }) => {
        if (active)
          Object.assign(element.style, {
            left: `${alignToPageLeft ? 8 : x}px`,
            top: `${y}px`,
            visibility: 'visible',
          });
      });
    });
    return () => {
      active = false;
      stop();
    };
  }, [open, viewportBounded, alignToPageLeft]);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target) &&
        !menu.current?.contains(event.target)
      )
        setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector('button')?.focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const content = open && (
    <div
      ref={menu}
      className="mf-menu"
      role="menu"
      aria-label={label}
      onKeyDown={(event) => {
        if (!viewportBounded || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const items = Array.from(
          menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
        );
        const index = items.findIndex((item) => item === document.activeElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }}
      style={
        viewportBounded
          ? { position: 'fixed', right: 'auto', top: 0, left: 0, visibility: 'hidden', zIndex: 100 }
          : undefined
      }
    >
      {children(() => setOpen(false))}
    </div>
  );
  return (
    <div
      className="mf-menu-wrap"
      ref={root}
      onKeyDown={(event) => {
        if (!viewportBounded || !open || event.target !== root.current?.querySelector('button')) return;
        if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) {
          event.preventDefault();
          menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
        }
      }}
    >
      <ToolButton label={label} expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={icon} />
      </ToolButton>
      {viewportBounded ? createPortal(content, document.body) : content}
    </div>
  );
}
