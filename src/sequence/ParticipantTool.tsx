import type { XYPosition } from '@xyflow/react';
import { DragPlacement } from '../components/DragPlacement';
import { Icon } from '../components/Icon';
import { ToolButton } from '../components/ToolButton';
export function ParticipantTool({
  active,
  disabled,
  onClick,
  onDrop,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  onDrop: (point: XYPosition) => void;
}) {
  return (
    <DragPlacement disabled={disabled} onDrop={onDrop} previewLabel="Participant">
      <ToolButton label="Place participant" hotkey="R" active={active} disabled={disabled} onClick={onClick}>
        <Icon name="rect" />
      </ToolButton>
    </DragPlacement>
  );
}
