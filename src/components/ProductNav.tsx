import { useEffect, useId, useRef, useState } from 'react';
import BrandMark from './BrandMark';
import { saveForNavigation } from '../persist';

const products = [
  { id: 'canvas', label: 'Diagrams', href: '#/diagrams' },
  { id: 'wiki', label: 'Wiki', href: '#/wiki' },
  { id: 'slides', label: 'Slides', href: '#/slides' },
] as const;

type Product = typeof products[number]['id'];

export default function ProductNav({ current, onNavigate, iconOnly = false, showBrand = true }: { current: Product; onNavigate?: () => void; iconOnly?: boolean; showBrand?: boolean }) {
  const [open, setOpen] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const label = products.find(product => product.id === current)!.label;

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !nav.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  if (window.__marmerladeRender) return null;
  return (
    <nav className="product-switcher" ref={nav} aria-label="Workspaces"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={event => {
        if (event.key !== 'Escape' || open) event.stopPropagation();
        if (open && event.key === 'Escape') {
          setOpen(false);
          button.current?.focus();
        }
      }}>
      {current !== 'canvas' && <span className="product-brand"><BrandMark decorative /><span><span className="brand-initial">m</span>ar<span className="brand-initial">m</span>erlade</span></span>}
      <div className="product-menu">
        <button ref={button} type="button" className="product-trigger" aria-label={label + ', switch workspace'}
          title={iconOnly ? label + ', switch workspace' : undefined} aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
          {!iconOnly && label}<span aria-hidden="true">▾</span>
        </button>
        <div id={listId} className="product-list" hidden={!open}>
          {products.map(({ id, label, href }) => (
            <a key={id} className="product-link" href={href} aria-current={id === current ? 'location' : undefined}
              onClick={event => {
                saveForNavigation();
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                setOpen(false);
                button.current?.focus();
                onNavigate?.();
              }}>
              {label}
              {id === current && <span className="product-check" aria-hidden="true">✓</span>}
            </a>
          ))}
        </div>
      </div>
      {current === 'canvas' && showBrand && <BrandMark decorative />}
    </nav>
  );
}
