import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePlayer } from '../flowPlayer';
import { useHotkeys } from '../useHotkeys';
import { Icon } from './Icon';
import { ToolButton } from './ToolButton';

export function FlowControls({ sig, steps }: { sig: string; steps: number }) {
  const { playing, lit, speed, stop, toggle, stepBy, cycleSpeed, setSchedule } = usePlayer();
  const [flowOpen, setFlowOpen] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);
  const noFlow = steps === 0;

  useLayoutEffect(() => setSchedule(sig, steps), [sig, steps, setSchedule]);
  useLayoutEffect(() => stop, [stop]);
  useEffect(() => {
    if (!flowOpen) return;
    const onDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !flowRef.current?.contains(event.target)) setFlowOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [flowOpen]);
  useHotkeys([
    { key: 'p', run: toggle },
    { key: ',', run: () => stepBy(-1) },
    { key: '.', run: () => stepBy(1) },
  ]);

  return (
    <div className="mf-menu-wrap" ref={flowRef}>
      <ToolButton
        label={playing ? 'Stop flow' : 'Play flow'}
        hotkey="P"
        active={playing}
        disabled={noFlow}
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
      {flowOpen && (
        <div className="mf-menu mf-flow-menu" role="toolbar" aria-label="Flow controls">
          <ToolButton label="Previous step" hotkey="," disabled={noFlow || !lit} onClick={() => stepBy(-1)}>
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
          <ToolButton label="Next step" hotkey="." disabled={noFlow} onClick={() => stepBy(1)}>
            <Icon name="step-fwd" />
          </ToolButton>
          <ToolButton label="Flow speed" disabled={noFlow} onClick={cycleSpeed}>
            <span className="mf-speed">{speed === 0.5 ? '½' : speed}×</span>
          </ToolButton>
        </div>
      )}
    </div>
  );
}
