// Toolbar popovers for shapes and catalog icons.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { NodeImage, NodeShape } from '../types';
import { SHAPES } from '../shapes';
import { ICONS } from '../icons/catalog';
import { CatalogIcon, ShapeGlyph } from './ShapeOutline';
import { Icon } from './Icon';

/** what the next canvas click places */
export interface Placement {
  shape: NodeShape;
  icon?: string;
  image?: NodeImage;
}

interface Item {
  key: string;
  name: string;
  place: Placement;
  glyph: React.ReactNode;
}

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'Shapes',
    items: SHAPES.map((d) => ({
      key: d.shape,
      name: d.name,
      place: { shape: d.shape },
      glyph: <ShapeGlyph shape={d.shape} />,
    })),
  },
  ...([
    ['tech', 'Tech'],
    ['ai', 'AI'],
    ['brand', 'Brands'],
  ] as const).map(([group, title]) => ({
    title,
    items: ICONS.filter((i) => i.group === group).map((i) => ({
      key: i.id,
      name: i.name,
      place: { shape: 'rect' as NodeShape, icon: i.id },
      glyph: <CatalogIcon id={i.id} size={18} />,
    })),
  })),
];

/** Close a toolbar popover on Escape or a click outside `wrap`. */
export function usePopover(open: boolean, onOpenChange: (open: boolean) => void, wrap: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as globalThis.Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange, wrap]);
}

export function ShapePicker({
  open,
  onOpenChange,
  onPick,
  kind = 'shapes',
}: {
  kind?: 'shapes' | 'icons';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (p: Placement) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  usePopover(open, onOpenChange, wrap);

  const pick = (p: Placement) => {
    onOpenChange(false);
    onPick(p);
  };

  return (
    <div className="mf-menu-wrap" ref={wrap}>
      <button
        className={open ? 'mf-tool is-active' : 'mf-tool'}
        aria-label={kind === 'shapes' ? 'Shapes' : 'Icons'}
        aria-expanded={open}
        title={kind === 'shapes' ? 'Shapes  ·  Y' : 'Icons  ·  R'}
        onClick={() => onOpenChange(!open)}
      >
        <Icon name={kind === 'shapes' ? 'shapes' : 'icon-library'} />
        <kbd className="mf-tool-key" aria-hidden="true">{kind === 'shapes' ? 'Y' : 'R'}</kbd>
      </button>
      {open && <PickerPanel onPick={pick} kind={kind} />}
    </div>
  );
}

/** The open popover: mounted fresh on every open, so the filter starts empty. */
function PickerPanel({ onPick, kind }: { onPick: (p: Placement) => void; kind: 'shapes' | 'icons' }) {
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = kind === 'shapes' ? SECTIONS.slice(0, 1) : SECTIONS.slice(1);
    if (!q) return available;
    return available.map((s) => ({
      ...s,
      items: s.items.filter((i) => i.name.toLowerCase().includes(q) || i.key.includes(q)),
    })).filter((s) => s.items.length > 0);
  }, [query, kind]);

  return (
    <div className="mf-menu mf-picker">
      <input
        autoFocus
        className="mf-picker-filter"
        placeholder="Search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          const first = sections[0]?.items[0];
          if (e.key === 'Enter' && first) onPick(first.place);
        }}
      />
      <div className="mf-picker-scroll">
        {sections.map((s) => (
          <section key={s.title}>
            <h3 className="mf-picker-title">{s.title}</h3>
            <div className="mf-picker-grid">
              {s.items.map((i) => (
                <button
                  key={i.key}
                  className="mf-picker-item"
                  title={i.name}
                  aria-label={i.name}
                  onClick={() => onPick(i.place)}
                >
                  {i.glyph}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

