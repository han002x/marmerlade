import { useState } from 'react';

/** A diagram name field that commits on Enter or blur, so uniqueness is applied once, not per keystroke. */
export function DiagramName({ value, label = 'Diagram name', className, onSave, onDone }: {
  value: string;
  label?: string;
  className?: string;
  onSave: (title: string) => void;
  /** called when editing ends, saved or not */
  onDone?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={className}
      aria-label={label}
      autoFocus={!!onDone}
      onFocus={(e) => onDone && e.currentTarget.select()}
      value={draft ?? value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onSave(draft);
        setDraft(null);
        onDone?.();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
