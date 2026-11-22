import { useEffect, useEffectEvent, useRef, type KeyboardEvent, type ReactNode } from 'react';

export type IconOption = { value: string; label: string; icon: ReactNode };

/**
 * A row of icon buttons that picks one value. Like `Choice`, it reports the option under the
 * pointer or keyboard focus so the canvas can draw it before it is chosen.
 */
export function IconChoice({
  label,
  value,
  options,
  change,
  preview,
  columns,
}: {
  label: string;
  value: string;
  options: IconOption[];
  change: (value: string) => void;
  preview?: (value: string | undefined) => void;
  /** Lay the options out as a grid with this many columns. */
  columns?: number;
}) {
  const group = useRef<HTMLDivElement>(null);
  const report = (option: string | undefined) => preview?.(option === value ? undefined : option);
  const clear = useEffectEvent(() => preview?.(undefined));
  // A form that unmounts mid-preview must not leave the canvas showing it.
  useEffect(() => () => clear(), []);
  const current = options.findIndex((option) => option.value === value);

  const key = (event: KeyboardEvent, i: number) => {
    const step = { ArrowRight: 1, ArrowDown: columns ?? 1, ArrowLeft: -1, ArrowUp: -(columns ?? 1) }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (i + step + options.length) % options.length;
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      className="sq-icon-choice"
      style={columns ? { gridTemplateColumns: `repeat(${columns}, auto)` } : undefined}
      data-field={label}
      onPointerLeave={() => report(undefined)}
    >
      {options.map((option, i) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          className="sq-icon-toggle"
          aria-checked={option.value === value}
          aria-label={option.label}
          title={option.label}
          tabIndex={i === (current < 0 ? 0 : current) ? 0 : -1}
          onPointerEnter={() => report(option.value)}
          onFocus={() => report(option.value)}
          onBlur={() => report(undefined)}
          onKeyDown={(event) => key(event, i)}
          onClick={() => {
            preview?.(undefined);
            change(option.value);
          }}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

export type ArrowHead = 'arrow' | 'open' | 'cross' | 'none' | 'both';

/** A small drawing of a Mermaid message arrow. */
export function ArrowGlyph({ dashed, head }: { dashed: boolean; head: ArrowHead }) {
  const left = head === 'both' ? 6 : 3;
  const right = head === 'none' ? 29 : head === 'cross' ? 27 : 25;
  return (
    <svg
      className="sq-arrow-glyph"
      width="32"
      height="16"
      viewBox="0 0 32 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={`M${left} 8H${right}`} strokeDasharray={dashed ? '3 2.5' : undefined} />
      {(head === 'arrow' || head === 'both') && <path d="M24 4l6 4-6 4Z" fill="currentColor" />}
      {head === 'both' && <path d="M8 4 2 8l6 4Z" fill="currentColor" />}
      {head === 'open' && <path d="M24 4l5 4-5 4" />}
      {head === 'cross' && <path d="m24 4 6 8m0-8-6 8" />}
    </svg>
  );
}
