import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePlayer } from '../flowPlayer';
import { useHotkeys } from '../useHotkeys';
import { Icon } from './Icon';
import { ToolButton } from './ToolButton';

export function FlowControls({ sig, steps, order }: {
  sig: string; steps: number;
  order?: { available: boolean; editing: boolean; begin: () => void; apply: () => void; cancel: () => void };
}) {
  const { playing, lit, speed, stop, toggle, stepBy, cycleSpeed, setSchedule } = usePlayer();
  const [flowOpen, setFlowOpen] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);
  const noFlow = steps === 0;
  const editing = order?.editing ?? false;

  useLayoutEffect(() => setSchedule(sig, steps), [sig, steps, setSchedule]);
  useLayoutEffect(() => stop, [stop]);
  useEffect(() => {
    if (!flowOpen || editing) return;
    const onDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !flowRef.current?.contains(event.target)) setFlowOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [flowOpen, editing]);
  useHotkeys([
    { key: 'p', run: () => {
      if (editing) return;
      if (order?.available && !playing) setFlowOpen(true);
      toggle();
    } },
    { key: ',', run: () => { if (!editing) stepBy(-1); } },
    { key: '.', run: () => { if (!editing) stepBy(1); } },
    ...(editing ? [{ key: 'escape', run: () => order?.cancel() }] : []),
  ]);

  return (
    <div className="mf-menu-wrap" ref={flowRef}>
      <ToolButton
        label={playing ? 'Stop flow' : 'Play flow'}
        hotkey="P"
        active={playing}
        disabled={editing || (noFlow && !order?.available)}
        onClick={() => {
          if (playing) {
            stop();
            setFlowOpen(false);
          } else {
            toggle();
            setFlowOpen(true);
          }
        }}
      >
        <Icon name={playing ? 'stop' : 'play'} />
      </ToolButton>
      {(flowOpen || editing) && (
        <div className="mf-menu mf-flow-menu" role="toolbar" aria-label="Flow controls">
          <div className="mf-flow-menu-row">
          <ToolButton label="Previous step" hotkey="," disabled={noFlow || editing || !lit} onClick={() => stepBy(-1)}>
            <Icon name="step-back" />
          </ToolButton>
          <ToolButton
            label={playing ? 'Pause flow' : 'Stop flow'}
            disabled={!playing && !lit}
            onClick={() => {
              if (playing) toggle();
              else {
                stop();
                setFlowOpen(false);
              }
            }}
          >
            <Icon name={playing ? 'pause' : 'stop'} />
          </ToolButton>
          <ToolButton label="Next step" hotkey="." disabled={noFlow || editing} onClick={() => stepBy(1)}>
            <Icon name="step-fwd" />
          </ToolButton>
          <ToolButton label="Flow speed" disabled={noFlow} onClick={cycleSpeed}>
            <span className="mf-speed">{speed === 0.5 ? '½' : speed}×</span>
          </ToolButton>
          {order && (
            editing ? (
              <>
                <ToolButton label="Done editing flow order" active onClick={order.apply}><Icon name="check" /></ToolButton>
                <ToolButton label="Cancel editing flow order" hotkey="Esc" onClick={order.cancel}><Icon name="close" /></ToolButton>
              </>
            ) : (
              <ToolButton label="Edit flow order" disabled={!order.available} onClick={() => {
                stop();
                order.begin();
              }}><Icon name="numbers" /></ToolButton>
            )
          )}
          </div>
          {editing && <p className="mf-flow-order-hint">0 = not in use. Clear for automatic.</p>}
        </div>
      )}
    </div>
  );
}
