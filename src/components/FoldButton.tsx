import { useFoldMotion } from '../foldMotion';

export function FoldButton({ id, label, collapsed }: { id: string; label: string; collapsed: boolean }) {
  const fold = useFoldMotion((s) => s.fold);
  const unfold = useFoldMotion((s) => s.unfold);
  if (window.__marmerladeRender) return null;
  const action = `${collapsed ? 'Unfold' : 'Fold'} ${label || 'group'}`;
  return (
    <button
      type="button"
      className="mf-fold-toggle nodrag nopan"
      aria-label={action}
      aria-expanded={!collapsed}
      title={action}
      onClick={(event) => {
        event.stopPropagation();
        (collapsed ? unfold : fold)([id]);
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path d={collapsed ? 'M4 8h8M8 4v8' : 'M4 8h8'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}
