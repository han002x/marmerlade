import { useFoldMotion } from '../foldMotion';
import { Icon } from './Icon';

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
      <Icon name={collapsed ? 'maximize-2' : 'minimize-2'} size={14} />
    </button>
  );
}
