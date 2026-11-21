import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import type { XYPosition } from '@xyflow/react';
import { ToolbarMenu } from '../diagrams/ToolbarMenu';
import { DragPlacement } from '../components/DragPlacement';
import { blocks, kinds, nameOf, spatial } from './model';

function Thumbnail({ kind }: { kind: string }) {
  return (
    <svg viewBox="0 0 100 54" aria-hidden="true">
      <path d="M25 14v36M75 14v36" stroke="currentColor" strokeDasharray="3 3" opacity=".35" />
      {kind === 'participant' ? (
        <>
          <rect x="10" y="4" width="30" height="15" rx="2" />
          <rect x="60" y="4" width="30" height="15" rx="2" />
        </>
      ) : kind === 'message' ? (
        <>
          <path d="M25 29h50m-8-5 8 5-8 5" />
          <text x="50" y="22">
            Message
          </text>
        </>
      ) : kind === 'note' ? (
        <>
          <path d="M32 18h36v22H32z" />
          <text x="50" y="32">
            Note
          </text>
        </>
      ) : blocks.includes(kind) ? (
        <>
          <rect x="8" y="5" width="84" height="43" rx="2" />
          <path d="M8 19h42l7-7V5" />
          <text x="30" y="15">
            {kind}
          </text>
          <path d="M25 32h50m-6-4 6 4-6 4" />
        </>
      ) : ['activate', 'deactivate', 'destroy'].includes(kind) ? (
        <>
          <rect x="21" y="18" width="8" height="26" />
          {kind === 'destroy' && <path d="m17 39 16 12m0-12-16 12" />}
        </>
      ) : (
        <>
          <rect x="8" y="8" width="84" height="37" rx="3" />
          <text x="50" y="29">
            {kind === 'autonumber' ? '1.  2.  3.' : nameOf(kind)}
          </text>
        </>
      )}
    </svg>
  );
}
type PaletteProps = {
  disabled: boolean;
  hasActors: boolean;
  choose: (kind: string) => void;
  move: (kind: string, point: XYPosition) => void;
  drop: (kind: string, point: XYPosition) => void;
  cancel: () => void;
};

function HoverPreview({
  kind,
  anchor,
  instruction,
}: {
  kind: string;
  anchor: HTMLElement;
  instruction: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let active = true;
    const stop = autoUpdate(anchor, element, () => {
      void computePosition(anchor, element, {
        strategy: 'fixed',
        placement: 'right-start',
        middleware: [
          offset(10),
          flip({ fallbackPlacements: ['left-start', 'bottom-start', 'top-start'] }),
          shift({ padding: 8, crossAxis: true }),
        ],
      }).then(({ x, y }) => {
        if (active) Object.assign(element.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' });
      });
    });
    return () => {
      active = false;
      stop();
    };
  }, [anchor, kind]);
  return createPortal(
    <div
      ref={ref}
      className="sq-element-preview"
      role="tooltip"
      aria-label={nameOf(kind) + ' preview'}
      style={{ visibility: 'hidden' }}
    >
      <Thumbnail kind={kind} />
      <strong>{nameOf(kind)}</strong>
      <small>{instruction}</small>
    </div>,
    document.body,
  );
}

function PaletteContent({
  disabled,
  hasActors,
  choose,
  move,
  drop,
  cancel,
  close,
}: PaletteProps & { close: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<{ kind: string; anchor: HTMLElement }>();
  const groups = [
    {
      title: 'Participants and messages',
      entries: kinds.filter((kind) => ['participant', 'message', 'note'].includes(kind)),
    },
    { title: 'Blocks', entries: blocks },
    {
      title: 'Advanced',
      entries: kinds.filter((kind) => !['participant', 'message', 'note', ...blocks].includes(kind)),
    },
  ];
  const needsActor = (kind: string) =>
    !hasActors && ['message', 'note', 'activate', 'deactivate', 'destroy'].includes(kind);
  const instruction = (kind: string) =>
    needsActor(kind)
      ? 'Add a participant first'
      : spatial(kind)
        ? kind === 'message'
          ? 'Choose sender and receiver'
          : 'Drag or click to place'
        : 'Configure and preview';
  return (
    <div className={'sq-palette' + (dragging ? ' is-dragging' : '')}>
      <div
        className="sq-palette-list"
        onScroll={() =>
          setPreview((value) => (value?.anchor.contains(document.activeElement) ? value : undefined))
        }
      >
        {groups.map(({ title, entries }) => (
          <section key={title}>
            <h3>{title}</h3>
            <div className="sq-palette-grid">
              {entries.map((kind) => {
                const unavailable = disabled || needsActor(kind);
                const tile = (
                  <button
                    role="menuitem"
                    className="sq-element-tile"
                    disabled={unavailable}
                    onFocus={(event) => setPreview({ kind, anchor: event.currentTarget })}
                    onBlur={() => setPreview(undefined)}
                    onClick={() => {
                      choose(kind);
                      close();
                    }}
                  >
                    <span>{nameOf(kind)}</span>
                  </button>
                );
                return (
                  <span
                    key={kind}
                    onPointerEnter={(event) => setPreview({ kind, anchor: event.currentTarget })}
                    onPointerLeave={() => setPreview(undefined)}
                  >
                    {spatial(kind) ? (
                      <DragPlacement
                        disabled={unavailable}
                        previewLabel={nameOf(kind)}
                        previewContent={
                          <span className="sq-drag-thumbnail">
                            <Thumbnail kind={kind} />
                            {nameOf(kind)}
                          </span>
                        }
                        onMove={(point) => {
                          setPreview(undefined);
                          setDragging(true);
                          move(kind, point);
                        }}
                        onCancel={() => {
                          setDragging(false);
                          cancel();
                        }}
                        onDrop={(point) => {
                          drop(kind, point);
                          close();
                        }}
                      >
                        {tile}
                      </DragPlacement>
                    ) : (
                      tile
                    )}
                  </span>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {preview && !dragging && (
        <HoverPreview kind={preview.kind} anchor={preview.anchor} instruction={instruction(preview.kind)} />
      )}
    </div>
  );
}

export function ElementPalette(props: PaletteProps) {
  return (
    <ToolbarMenu label="Add element" icon="plus" viewportBounded alignToPageLeft>
      {(close) => <PaletteContent {...props} close={close} />}
    </ToolbarMenu>
  );
}
