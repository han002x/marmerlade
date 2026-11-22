import { useEffect, useEffectEvent, useId, useRef, useState, type KeyboardEvent } from 'react';

export type ChoiceOption = { value: string; label: string; hint?: string };
export type ChoiceGroup = { label?: string; options: ChoiceOption[] };

/**
 * A select-like dropdown that reports the option under the pointer or keyboard focus,
 * so the form can draw that option on the canvas before it is chosen.
 */
export function Choice({
  label,
  value,
  groups,
  change,
  preview,
  required,
  hideLabel,
}: {
  label: string;
  value: string;
  groups: ChoiceGroup[];
  change: (value: string) => void;
  /** Called with the option being considered, and with undefined when nothing is. */
  preview?: (value: string | undefined) => void;
  required?: boolean;
  /** Keep the label for assistive technology only. */
  hideLabel?: boolean;
}) {
  const id = useId();
  const options = groups.flatMap((group) => group.options);
  const current = options.find((option) => option.value === value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const report = (option: string | undefined) => preview?.(option);
  const clear = useEffectEvent(() => preview?.(undefined));
  const starts = groups.map((_, g) => groups.slice(0, g).reduce((sum, group) => sum + group.options.length, 0));

  const consider = (i: number) => {
    setActive(i);
    report(i >= 0 && options[i].value !== value ? options[i].value : undefined);
  };
  const close = (refocus = true) => {
    setOpen(false);
    setActive(-1);
    report(undefined);
    if (refocus) button.current?.focus({ preventScroll: true });
  };
  const choose = (i: number) => {
    if (i >= 0) change(options[i].value);
    close();
  };
  const show = () => {
    setOpen(true);
    setActive(Math.max(0, options.indexOf(current!)));
  };

  const dismiss = useEffectEvent(() => close(false));
  useEffect(() => {
    if (!open) return;
    const away = (event: Event) => {
      const target = event.target as Node;
      if (list.current?.contains(target) || button.current?.contains(target)) return;
      dismiss();
    };
    document.addEventListener('pointerdown', away, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
    };
  }, [open]);
  useEffect(() => {
    if (open && active >= 0) list.current?.querySelector('#' + CSS.escape(id + '-' + active))?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id]);
  // A form that unmounts mid-preview must not leave the canvas showing it.
  useEffect(() => () => clear(), []);

  const key = (event: KeyboardEvent) => {
    const last = options.length - 1;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        show();
      }
      return;
    }
    const move = (i: number) => {
      event.preventDefault();
      consider(Math.min(last, Math.max(0, i)));
    };
    if (event.key === 'ArrowDown') move(active + 1);
    else if (event.key === 'ArrowUp') move(active - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(last);
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      // Close only the menu, not the insertion behind it.
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') close(false);
    else if (event.key.length === 1) {
      const at = options.findIndex(
        (option, i) => i > active && option.label.toLowerCase().startsWith(event.key.toLowerCase()),
      );
      const wrap = options.findIndex((option) => option.label.toLowerCase().startsWith(event.key.toLowerCase()));
      if (at >= 0 || wrap >= 0) move(at >= 0 ? at : wrap);
    }
  };

  return (
    <div className="sq-choice">
      <label htmlFor={id} className={hideLabel ? 'sq-sr-only' : undefined}>
        {label}
      </label>
      <button
        id={id}
        ref={button}
        type="button"
        role="combobox"
        data-field={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id + '-list'}
        aria-activedescendant={open && active >= 0 ? id + '-' + active : undefined}
        className="sq-choice-button"
        onClick={() => (open ? close() : show())}
        onKeyDown={key}
      >
        <span>{current?.label ?? (value || label + '…')}</span>
        {current?.hint && <code>{current.hint}</code>}
      </button>
      {required && (
        <input className="sq-choice-required" tabIndex={-1} aria-hidden required value={value} onChange={() => {}} />
      )}
      {open && (
        <ul
          ref={list}
          id={id + '-list'}
          role="listbox"
          aria-label={label}
          className="sq-choice-list"
          onPointerLeave={() => consider(-1)}
        >
          {groups.map((group, g) => (
            <li key={g} role="presentation">
              {group.label && <strong role="presentation">{group.label}</strong>}
              <ul role="presentation">
                {group.options.map((option, o) => {
                  const i = starts[g] + o;
                  return (
                    <li
                      key={option.value}
                      id={id + '-' + i}
                      role="option"
                      aria-selected={option.value === value}
                      className={i === active ? 'is-active' : undefined}
                      onPointerEnter={() => consider(i)}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => choose(i)}
                    >
                      <span>{option.label}</span>
                      {option.hint && <code>{option.hint}</code>}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
