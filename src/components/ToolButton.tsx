/** A toolbar button with its keyboard shortcut in the bottom-right corner. */
export function ToolButton({
  label,
  hotkey,
  active,
  expanded,
  disabled,
  onClick,
  children,
}: {
  label: string;
  hotkey?: string;
  /** show the current tool pressed */
  active?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={active ? 'mf-tool is-active' : 'mf-tool'}
      aria-label={label}
      aria-pressed={active}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      aria-expanded={expanded}
      disabled={disabled}
      title={hotkey ? `${label}  ·  ${hotkey}` : label}
      onClick={onClick}
    >
      {children}
      {hotkey && (
        <kbd className="mf-tool-key" aria-hidden="true">
          {hotkey}
        </kbd>
      )}
    </button>
  );
}
