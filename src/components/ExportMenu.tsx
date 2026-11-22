import { useEffect, useRef, useState } from 'react';
import { exportHeight } from '../gifMath';
import { exportFile } from '../persist';
import { Icon } from './Icon';
import { ToolButton } from './ToolButton';

export type ExportFormat = 'png' | 'gif';

const widths = [900, 1440, 1920];

export function ExportMenu({ size, disabled, exporting, onExport }: {
  size: { width: number; height: number };
  disabled?: boolean;
  exporting: ExportFormat | null;
  onExport: (format: ExportFormat, width: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(widths[0]);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      menu.current?.querySelector('button')?.focus();
      setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function save(format: ExportFormat) {
    setOpen(false);
    onExport(format, width);
  }

  return (
    <div className="mf-menu-wrap" ref={menu}>
      <ToolButton label="Export" active={open} expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="export" />
      </ToolButton>
      {open && (
        <div className="mf-menu mf-export-menu" role="group" aria-label="Export">
          <button type="button" className="mf-menu-item" onClick={() => {
            setOpen(false);
            exportFile();
          }}>
            <Icon name="export" />
            <span>Workspace file <small>JSON</small></span>
          </button>
          <span className="mf-menu-sep" />
          <label className="mf-export-resolution">
            <span>Resolution</span>
            <select value={width} disabled={disabled || exporting !== null} onChange={(event) => setWidth(Number(event.target.value))}>
              {widths.map((option) => (
                <option key={option} value={option}>
                  {option} × {size.width > 0 ? exportHeight(option, size) : '—'} px
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="mf-menu-item" disabled={disabled || exporting !== null} onClick={() => save('png')}>
            <Icon name="export" />
            <span>{exporting === 'png' ? 'Exporting PNG…' : 'Export PNG'}</span>
          </button>
          <button type="button" className="mf-menu-item" disabled={disabled || exporting !== null} onClick={() => save('gif')}>
            <Icon name="film" />
            <span>{exporting === 'gif' ? 'Exporting GIF…' : 'Export GIF'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
