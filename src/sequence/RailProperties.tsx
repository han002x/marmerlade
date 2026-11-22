import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';

export type PropertyFocus = { field?: string };

export function RailProperties({
  label,
  focus,
  canvas,
  children,
}: {
  label: string;
  focus?: PropertyFocus;
  canvas: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const section = useRef<HTMLElement>(null);
  const entry = useRef<HTMLElement | SVGElement>(null);

  useLayoutEffect(() => {
    const element = section.current;
    if (!element || !focus) return;
    const drawing = canvas.current;
    const active = document.activeElement;
    if ((active instanceof HTMLElement || active instanceof SVGElement) && !element.contains(active))
      entry.current = active;

    const requested = focus.field && element.querySelector<HTMLElement>('[data-field="' + CSS.escape(focus.field) + '"]');
    const first = element.querySelector<HTMLElement>('input:not([tabindex="-1"]), textarea, [role="combobox"], button');
    const field = requested || first || element;
    field.focus();
    if (field instanceof HTMLInputElement && field.type === 'text') field.select();

    return () => {
      const previous = entry.current;
      requestAnimationFrame(() => {
        if (document.activeElement !== document.body) return;
        const target = previous?.isConnected && previous !== document.body ? previous : drawing;
        if (target?.isConnected) target.focus({ preventScroll: true });
      });
    };
  }, [canvas, focus]);

  return <section ref={section} aria-label={label} className="sq-rail-properties" tabIndex={-1}>{children}</section>;
}
