import { Handle, Position } from '@xyflow/react';
import type { Side } from '../types';

const SIDES: [Side, Position][] = [
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
];

/** A connection point on every side. Loose connection mode lets any of them start or end an edge. */
export function SideHandles({ className, connectable }: { className?: string; connectable?: boolean }) {
  return SIDES.map(([side, position]) => (
    <Handle key={side} id={side} type="source" position={position} className={className} isConnectable={connectable} />
  ));
}
