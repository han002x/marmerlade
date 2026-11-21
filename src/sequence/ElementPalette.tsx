import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import type { XYPosition } from '@xyflow/react';
import { ToolbarMenu } from '../diagrams/ToolbarMenu';
import { DragPlacement } from '../components/DragPlacement';
import { blocks, descriptions, kinds, nameOf, placementInstruction, spatial } from './model';

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
      ) : kind === 'box' ? (
        <>
          <rect x="4" y="2" width="92" height="22" rx="2" strokeDasharray="2 2" />
          <rect x="12" y="7" width="26" height="12" rx="2" />
          <rect x="62" y="7" width="26" height="12" rx="2" />
          <text x="50" y="31">
            group
          </text>
        </>
      ) : kind === 'rect' ? (
        <>
          <rect x="8" y="16" width="84" height="26" rx="2" fill="currentColor" fillOpacity=".12" stroke="none" />
          <path d="M25 29h50m-6-4 6 4-6 4" />
        </>
      ) : blocks.includes(kind) ? (
        <>
          <rect x="8" y="5" width="84" height="43" rx="2" />
          <path d="M8 19h42l7-7V5" />
          <text x="30" y="15">
            {kind === 'par_over' ? 'par' : kind}
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
  /** Why every element is unavailable right now, or nothing when they can be used. */
  disabledReason?: string;
  hasActors: boolean;
  choose: (kind: string) => void;
  /** Draw an example of the element under the pointer in the diagram, or clear it. */
  sample?: (kind?: string) => void;
  /** Whether the diagram can draw an example of the element, which then replaces the hover card. */
  hasSample?: (kind: string) => boolean;
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
      {descriptions[kind] && <span>{descriptions[kind]}</span>}
      <small>{instruction}</small>
    </div>,
    document.body,
  );
}

function PaletteContent({
  disabledReason,
  hasActors,
  choose,
  sample,
  hasSample,
  move,
  drop,
  cancel,
  close,
}: PaletteProps & { close: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<{ kind: string; anchor: HTMLElement }>();
  const report = useEffectEvent((kind?: string) => sample?.(kind));
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
  const pointer = useRef<{ x: number; y: number }>(undefined);
  const needsActor = (kind: string) =>
    !hasActors &&
    (['message', 'note', 'activate', 'deactivate', 'destroy'].includes(kind) ||
      (blocks.includes(kind) && kind !== 'box'));
  const instruction = (kind: string) =>
    disabledReason
      ? disabledReason
      : needsActor(kind)
        ? 'Add a participant first.'
        : placementInstruction(kind);
  const shown = preview && !dragging && !disabledReason && !needsActor(preview.kind) ? preview.kind : undefined;
  useEffect(() => {
    // Short pauses keep the diagram still while the pointer crosses tiles and the gaps between them.
    const timer = setTimeout(() => report(shown), shown ? 120 : 100);
    return () => clearTimeout(timer);
  }, [shown]);
  useEffect(() => () => report(undefined), []);
  return (
    <div className={'sq-palette' + (dragging ? ' is-dragging' : '')}>
      <div
        className="sq-palette-list"
        onPointerMove={(event) => {
          pointer.current = { x: event.clientX, y: event.clientY };
        }}
        onScroll={() => {
          // Content moves under a resting pointer, so follow the tile now beneath it.
          const at = pointer.current;
          const tile = at && document.elementFromPoint(at.x, at.y)?.closest<HTMLElement>('[data-kind]');
          setPreview((value) =>
            tile
              ? { kind: tile.dataset.kind!, anchor: tile }
              : value?.anchor.contains(document.activeElement)
                ? value
                : undefined,
          );
        }}
      >
        {groups.map(({ title, entries }) => (
          <section key={title}>
            <h3>{title}</h3>
            <div className="sq-palette-grid">
              {entries.map((kind) => {
                const unavailable = !!disabledReason || needsActor(kind);
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
                    data-kind={kind}
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
      {preview && !dragging && !(shown && hasSample?.(shown)) && (
        <HoverPreview kind={preview.kind} anchor={preview.anchor} instruction={instruction(preview.kind)} />
      )}
    </div>
  );
}

export function ElementPalette(props: PaletteProps) {
  return (
    <ToolbarMenu label="Add element" icon="insert" viewportBounded alignToPageLeft>
      {(close) => <PaletteContent {...props} close={close} />}
    </ToolbarMenu>
  );
}
