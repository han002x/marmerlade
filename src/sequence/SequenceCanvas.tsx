import { useWorkspaceZoom } from '../diagrams/useWorkspaceZoom';
import { useDock } from '../dock';
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  ControlButton,
  getViewportForBounds,
  Handle,
  Position,
  useConnection,
  MiniMap,
  ReactFlow,
  ViewportPortal,
  useReactFlow,
  useViewport,
  type Node,
  type NodeProps,
  type XYPosition,
} from '@xyflow/react';
import { Icon } from '../components/Icon';
import { SideHandles } from '../components/SideHandles';
import { JoinPreview } from '../components/JoinPreview';
import { activeAppearance, useAppearance } from '../theme';
import { useHotkeys } from '../useHotkeys';
import {
  changeLabel,
  insertParticipant,
  moveLane,
  moveMessage,
  removeSelection,
  type CanvasEdit,
} from './canvasEdits';
import { insertElement } from './insertion';
import { sequenceDragPreview } from './dragPreview';
import { bindSelection } from './selection';
import { nameOf, type Statement } from './model';

export type Tool = 'select' | 'participant' | 'message';
type Item = {
  connectFromBody?: boolean;
  actor?: string;
  start?: number;
  label: string;
  kind: string;
};
type HitNode = Node<Item & Record<string, unknown>, 'sequenceItem'>;
type Editor = {
  point: XYPosition;
  value: string;
  initial: string;
  label: string;
  source: string;
  edit: (value: string) => CanvasEdit;
};
export interface PlacementHandle {
  move: (kind: string, point: XYPosition) => void;
  drop: (kind: string, point: XYPosition) => void;
  cancel: () => void;
}
interface Props {
  ref: React.Ref<PlacementHandle>;
  placementKind?: string;
  onPlace: (kind: string, at: number, selected: Statement[], actor?: string) => void;
  onPropose: (edit: CanvasEdit) => void;
  workspaceZoom?: number;
  svg: string;
  source: string;
  rows: Statement[];
  selected?: Statement;
  selectedActor?: string;
  editable: boolean;
  tool: Tool;
  onTool: (tool: Tool) => void;
  onSelect: (row?: Statement, actor?: string, inspect?: boolean) => void;
  onCommit: (source: string, at: number) => Promise<boolean>;
  onError: (error: string) => void;
  onSource: () => void;
}

const Drawing = memo(function Drawing({ svg }: { svg: string }) {
  return <div className="sq-drawing" dangerouslySetInnerHTML={{ __html: svg }} />;
});
function Hit({ id, data, dragging, isConnectable }: NodeProps<HitNode>) {
  const target = useConnection((c) => c.inProgress && c.toNode?.id === id && c.isValid);

  return (
    <div
      className={
        'sq-hit' +
        (data.actor ? ' actor' : '') +
        (dragging ? ' dragging' : '') +
        (target ? ' join-target' : '') +
        (data.connectFromBody ? ' connect-from-body' : '')
      }
    >
      {data.kind === 'emptyBlock' && <span className="sq-empty-block-label">{data.label}</span>}
      {data.actor && (
        <Handle
          id="body"
          type="source"
          position={Position.Right}
          className="sq-body-handle"
          isConnectable={isConnectable}
          isConnectableStart={!!data.connectFromBody}
          isConnectableEnd={isConnectable}
        />
      )}
      {data.actor && <SideHandles connectable={isConnectable} />}
    </div>
  );
}
const nodeTypes = { sequenceItem: Hit };
const emptyBox = { x: 0, y: 0, width: 400, height: 240 };
const centreX = (n: HitNode) => n.position.x + (n.width ?? 0) / 2;
const centreY = (n: HitNode) => n.position.y + (n.height ?? 0) / 2;

export default function SequenceCanvas({
  ref,
  placementKind,
  onPlace,
  onPropose,
  workspaceZoom,
  svg,
  source,
  rows,
  selected,
  selectedActor,
  editable,
  tool,
  onTool,
  onSelect,
  onCommit,
  onError,
  onSource,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const { setViewport, screenToFlowPosition } = useReactFlow();
  const viewport = useViewport();
  useWorkspaceZoom(workspaceZoom);
  const appearance = activeAppearance(useAppearance());
  const [geometry, setGeometry] = useState<{
    source: string;
    nodes: HitNode[];
    box: typeof emptyBox;
  }>({
    source: '',
    nodes: [],
    box: emptyBox,
  });
  const [drag, setDrag] = useState<{ id: string; position: XYPosition } | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [placementGuide, setPlacementGuide] = useState<{
    kind: string;
    point: XYPosition;
  }>();
  const [messageAt, setMessageAt] = useState<number>();
  const [sender, setSender] = useState<string>();
  const [actorSelected, setActorSelected] = useState<string>();
  const [joining, setJoining] = useState(false);
  const hasFitted = useRef(false);
  const previewDrag = useRef<((delta: number) => void) | null>(null);
  useLayoutEffect(
    () => () => {
      previewDrag.current?.(0);
      previewDrag.current = null;
    },
    [svg, source, tool],
  );
  const input = useRef<HTMLInputElement>(null);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);

  const [group, setGroup] = useState<string[]>();
  const marquee = useRef(false);
  const fit = useCallback(
    (box: typeof emptyBox) => {
      if (root.current)
        void setViewport(
          getViewportForBounds(
            box,
            root.current.clientWidth,
            root.current.clientHeight,
            0.05,
            workspaceZoom ?? 1,
            0.3,
          ),
        );
    },
    [setViewport, workspaceZoom],
  );
  useLayoutEffect(() => {
    if (!portal) return;
    const drawing = portal.querySelector('svg');
    if (!drawing) {
      setGeometry({ source, nodes: [], box: emptyBox });
      hasFitted.current = false;
      return;
    }
    bindSelection(drawing, rows);
    const view = drawing.viewBox.baseVal;
    const box = {
      x: view.x,
      y: view.y,
      width: view.width,
      height: view.height,
    };
    Object.assign(portal.style, {
      left: box.x + 'px',
      top: box.y + 'px',
      width: box.width + 'px',
      height: box.height + 'px',
    });
    const matrix = drawing.getScreenCTM();
    if (!matrix || !matrix.a) return;
    const inverse = matrix.inverse();
    const nodes: HitNode[] = [];
    function add(elements: Element[], id: string, data: Item, ariaLabel = data.kind + ' ' + data.label) {
      const bounds = elements.map((el) => el.getBoundingClientRect()).filter((r) => r.width || r.height);
      if (!bounds.length) return;
      const r = {
        x: Math.min(...bounds.map((b) => b.left)),
        y: Math.min(...bounds.map((b) => b.top)),
        right: Math.max(...bounds.map((b) => b.right)),
        bottom: Math.max(...bounds.map((b) => b.bottom)),
      };
      const p = new DOMPoint(r.x, r.y).matrixTransform(inverse),
        q = new DOMPoint(r.right, r.bottom).matrixTransform(inverse);
      const width = Math.max(20, q.x - p.x),
        height = Math.max(16, q.y - p.y);
      if (nodes.some((n) => n.id === id)) return;
      nodes.push({
        id,
        type: 'sequenceItem',
        data,
        position: { x: p.x - (width - (q.x - p.x)) / 2, y: p.y },
        width,
        height,
        ariaLabel,
      });
    }
    for (const el of drawing.querySelectorAll('[data-et="participant"]')) {
      const actor = el.getAttribute('data-id');
      if (actor)
        add([el], 'actor:' + actor, {
          actor,
          label:
            rows.find((r) => r.kind === 'participant' && r.values[0] === actor)?.values[1] ||
            el.querySelector('text')?.textContent ||
            actor,
          kind: 'Participant',
        });
    }
    const parts = new Map<number, Element[]>();
    for (const el of drawing.querySelectorAll('.messageText,[data-et="note"],[data-et="message"]')) {
      if (!el.hasAttribute('data-statement')) continue;
      const start = Number(el.getAttribute('data-statement'));
      const elements = parts.get(start) ?? [];
      elements.push(el);
      parts.set(start, elements);
    }
    for (const row of rows) {
      const elements = parts.get(row.start);
      if (elements) {
        const label = row.values[row.kind === 'note' ? 2 : 3];
        const description =
          row.kind === 'message' && !label
            ? 'Message from ' + row.values[0] + ' to ' + row.values[1]
            : undefined;
        add(elements, 'row:' + row.start, { start: row.start, label, kind: row.kind }, description);
      }
    }
    for (const row of rows) {
      if (!row.close || rows.some((child) => child.parent === row && child.kind !== 'end')) continue;
      const element = drawing.querySelector('[data-statement="' + row.start + '"]');
      if (element)
        add([element], 'empty:' + row.start, {
          start: row.start,
          label: 'Add inside ' + nameOf(row.kind),
          kind: 'emptyBlock',
        });
    }
    setGeometry({ source, nodes, box });
    if (!hasFitted.current) {
      hasFitted.current = true;
      fit(box);
    }
  }, [portal, svg, rows, source, fit]);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [editor?.point]);
  useEffect(() => {
    setEditor(null);
    setActorSelected(undefined);
    setDrag(null);
    setGroup(undefined);
  }, [source, tool]);
  useEffect(() => {
    setSender(undefined);
    setMessageAt(undefined);
  }, [source]);
  const canEdit = editable && source === geometry.source;
  const actors = geometry.nodes.filter((n) => n.data.actor).sort((a, b) => centreX(a) - centreX(b));
  const messages = geometry.nodes
    .filter((n) => n.data.kind === 'message')
    .sort((a, b) => centreY(a) - centreY(b));
  const activeActor =
    selectedActor ??
    (selected?.kind === 'participant'
      ? selected.values[0]
      : actorSelected && !selected
        ? actorSelected
        : undefined);
  useEffect(() => {
    setGroup(undefined);
  }, [selected]);
  useLayoutEffect(() => {
    for (const el of portal?.querySelectorAll('[data-statement]') ?? []) {
      el.classList.toggle(
        'sq-selected',
        !group && !selectedActor && selected?.start === Number(el.getAttribute('data-statement')),
      );
    }
  }, [portal, svg, selected, selectedActor, group]);
  const nodes = useMemo(
    () =>
      geometry.nodes.map((n) => ({
        ...n,
        data: { ...n.data, connectFromBody: tool === 'message' },
        selected: group
          ? group.includes(n.id)
          : n.data.actor
            ? n.data.actor === activeActor
            : !selectedActor && n.data.start === selected?.start,
        draggable:
          canEdit &&
          !placementKind &&
          tool === 'select' &&
          ['Participant', 'message'].includes(n.data.kind) &&
          !editor,
        connectable: canEdit && tool !== 'participant' && !editor,
        ...(drag?.id === n.id && { position: drag.position, dragging: true }),
      })),
    [geometry, drag, selected, selectedActor, activeActor, tool, canEdit, editor, group, placementKind],
  );

  async function apply(edit: () => CanvasEdit) {
    if (!canEdit) return false;
    try {
      const next = edit();
      return next.source !== source && (await onCommit(next.source, next.at));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }
  function selectItem(data: Item) {
    setGroup(undefined);
    setActorSelected(data.actor);
    const row = data.actor
      ? rows.find((r) => r.kind === 'participant' && r.values[0] === data.actor)
      : rows.find((r) => r.start === data.start);
    onSelect(row, data.actor);
  }
  function begin(point: XYPosition, label: string, value: string, edit: Editor['edit']) {
    if (!canEdit) return;
    setEditor({ point, label, value, initial: value, source, edit });
  }
  function rename(data: Item, point: XYPosition) {
    selectItem(data);
    const row = rows.find((r) => r.start === data.start);
    begin(
      point,
      data.actor ? 'Participant label' : data.kind === 'note' ? 'Note text' : 'Message label',
      data.label,
      (value) => changeLabel(source, rows, row, data.actor, value),
    );
  }
  function proposeMessage(from: string, to: string) {
    const text = from + '->>' + to + ': ';
    const at =
      messageAt ??
      (selected?.kind === 'participant'
        ? source.length
        : (selected?.close?.start ?? selected?.end ?? source.length));
    onPropose(insertElement(source, text, 'message', at));
    setSender(undefined);
    setMessageAt(undefined);
    onTool('select');
  }
  const laneAfter = (point: XYPosition) => actors.find((n) => centreX(n) > point.x)?.data.actor;
  const selectedRows = () =>
    rows.filter((row) =>
      group
        ? group.includes('row:' + row.start) ||
          (row.kind === 'participant' && group.includes('actor:' + row.values[0]))
        : row === selected,
    );
  function slot(point: XYPosition) {
    for (const row of rows) {
      if (!row.close || rows.some((child) => child.parent === row && child.kind !== 'end')) continue;
      const element = portal?.querySelector<SVGGraphicsElement>('[data-statement="' + row.start + '"]');
      const box = element?.getBBox();
      if (box && point.y >= box.y && point.y <= box.y + box.height) return row.close.start;
    }
    const next = messages.find((node) => centreY(node) > point.y);
    if (next) return next.data.start ?? source.length;
    if (selected?.close) return selected.close.start;
    return source.length;
  }
  function placeElement(kind: string, point: XYPosition) {
    if (!canEdit) return;
    const actor = actors.reduce<HitNode | undefined>(
      (best, node) =>
        !best || Math.abs(centreX(node) - point.x) < Math.abs(centreX(best) - point.x) ? node : best,
      undefined,
    )?.data.actor;
    if (kind === 'participant') onPropose(insertParticipant(source, rows, laneAfter(point), ''));
    else if (kind === 'message') {
      setMessageAt(slot(point));
      setSender(actor);
      onTool('message');
    } else onPlace(kind, slot(point), selectedRows(), actor);
  }
  useImperativeHandle(ref, () => ({
    move(kind, client) {
      if (!root.current?.contains(document.elementFromPoint(client.x, client.y))) {
        setPlacementGuide(undefined);
        return;
      }
      const point = screenToFlowPosition(client);
      const next = messages.find((node) => centreY(node) > point.y);
      const previous = messages.filter((node) => centreY(node) <= point.y).at(-1);
      const before = actors.find((node) => centreX(node) > point.x);
      const left = actors.filter((node) => centreX(node) <= point.x).at(-1);
      setPlacementGuide({
        kind,
        point: {
          x: before
            ? left
              ? (centreX(left) + centreX(before)) / 2
              : centreX(before) - 90
            : left
              ? centreX(left) + 90
              : point.x,
          y: next
            ? previous
              ? (centreY(previous) + centreY(next)) / 2
              : centreY(next) - 20
            : previous
              ? centreY(previous) + 30
              : point.y,
        },
      });
    },
    cancel() {
      setPlacementGuide(undefined);
    },
    drop(kind, client) {
      const el = document.elementFromPoint(client.x, client.y);
      if (!canEdit || !root.current?.contains(el) || el?.closest('.react-flow__panel')) return;
      placeElement(kind, screenToFlowPosition(client));
      setPlacementGuide(undefined);
    },
  }));
  function place(point: XYPosition) {
    placeElement('participant', point);
  }
  function clickItem(data: Item, point: XYPosition) {
    if (placementKind && canEdit) {
      const block = rows.find((row) => row.start === data.start);
      if (data.kind === 'emptyBlock' && block?.close) onPlace(placementKind, block.close.start, []);
      else placeElement(placementKind, point);
      return;
    }
    if (!canEdit) {
      selectItem(data);
      return;
    }
    if (tool === 'participant') {
      place(point);
      return;
    }
    if (tool === 'message' && data.actor) {
      if (sender) proposeMessage(sender, data.actor);
      else {
        setSender(data.actor);
        selectItem(data);
      }
    } else selectItem(data);
  }
  const pending = useRef(false);
  async function finish() {
    if (!editor || pending.current || !editor.value.trim() || editor.source !== source || !editable) return;
    if (editor.initial === editor.value) {
      setEditor(null);
      return;
    }
    pending.current = true;
    try {
      const next = editor.edit(editor.value.trim());
      if (await onCommit(next.source, next.at)) {
        setEditor(null);
        onTool('select');
      } else input.current?.focus();
    } catch (e) {
      onError(String(e));
    } finally {
      pending.current = false;
    }
  }
  const deleteSelected = () =>
    apply(() => {
      const items = nodes.filter((n) => n.selected);
      const selectedActors = items.flatMap((n) => (n.data.actor ? [n.data.actor] : []));
      const selectedRows = rows.filter(
        (row) => items.some((n) => n.data.start === row.start) || (!group && row === selected),
      );
      return removeSelection(source, rows, selectedRows, selectedActors);
    });
  useHotkeys([
    { key: 'delete', run: deleteSelected },
    { key: 'backspace', run: deleteSelected },
    {
      key: 'escape',
      run: () => {
        previewDrag.current?.(0);
        previewDrag.current = null;
        setDrag(null);
        setEditor(null);
        setSender(undefined);
        setGroup(undefined);
        onTool('select');
        setActorSelected(undefined);
        onSelect();
      },
    },
    { key: 'v', run: () => onTool('select') },
    { key: 'r', run: () => canEdit && onTool('participant') },
    {
      key: 't',
      run: () => useDock.setState({ open: true, view: 'appearance' }),
    },
    { key: 'm', run: onSource },
  ]);

  return (
    <div
      className={
        'mf-canvas sq-flow' + (joining ? ' is-connecting' : '') + (tool !== 'select' ? ' is-placing' : '')
      }
      ref={root}
      aria-label="Sequence canvas"
    >
      <ReactFlow<HitNode>
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        deleteKeyCode={null}
        nodesConnectable={canEdit}
        nodesFocusable
        elementsSelectable
        selectionOnDrag={tool === 'select' && !placementKind}
        zoomOnDoubleClick={false}
        minZoom={0.05}
        panOnDrag={workspaceZoom ? false : [1, 2]}
        panActivationKeyCode={workspaceZoom ? null : 'Space'}
        zoomOnScroll={!workspaceZoom}
        zoomOnPinch={!workspaceZoom}
        zoomActivationKeyCode={workspaceZoom ? null : undefined}
        preventScrolling={!workspaceZoom}
        autoPanOnNodeDrag={!workspaceZoom}
        autoPanOnConnect={!workspaceZoom}
        onSelectionStart={() => {
          marquee.current = true;
          setGroup([]);
        }}
        onSelectionEnd={() => {
          marquee.current = false;
        }}
        onNodesChange={(changes) => {
          if (!marquee.current) return;
          const selections = changes.filter((change) => change.type === 'select');
          if (selections.length)
            setGroup((previous) => {
              const ids = new Set(previous);
              for (const change of selections) {
                if (change.selected) ids.add(change.id);
                else ids.delete(change.id);
              }
              return [...ids];
            });
        }}
        connectOnClick={tool === 'select'}
        connectionMode={ConnectionMode.Loose}
        connectionLineComponent={JoinPreview}
        onConnectStart={() => setJoining(true)}
        onConnectEnd={() => setJoining(false)}
        onConnect={({ source: from, target: to }) => {
          const a = actors.find((n) => n.id === from),
            b = actors.find((n) => n.id === to);
          if (a?.data.actor && b?.data.actor) {
            proposeMessage(a.data.actor, b.data.actor);
            setSender(undefined);
            onTool('select');
          }
        }}
        onPaneClick={(e) => {
          if (!canEdit) return;
          if (editor) return;
          if (placementKind)
            placeElement(placementKind, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
          else if (tool === 'participant') place(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
          else {
            setGroup(undefined);
            setActorSelected(undefined);
            onSelect();
          }
        }}
        onNodeClick={(e, n) => {
          if (tool === 'select' && (e.shiftKey || e.ctrlKey || e.metaKey)) {
            const ids = nodes.filter((node) => node.selected).map((node) => node.id);
            setGroup(ids.includes(n.id) ? ids.filter((id) => id !== n.id) : [...ids, n.id]);
          } else clickItem(n.data, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
        }}
        onNodeDoubleClick={(e, n) => {
          if (tool === 'select') rename(n.data, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
        }}
        onNodeDragStart={(_, n) => {
          const drawing = portal?.querySelector('svg');
          if (drawing) previewDrag.current = sequenceDragPreview(drawing, rows, n.data.actor, n.data.start);
        }}
        onNodeDrag={(_, n) => {
          const old = geometry.nodes.find((x) => x.id === n.id);
          if (!old || !previewDrag.current) return;
          previewDrag.current(n.data.actor ? n.position.x - old.position.x : n.position.y - old.position.y);
          setDrag({
            id: n.id,
            position: n.data.actor
              ? { x: n.position.x, y: old.position.y }
              : { x: old.position.x, y: n.position.y },
          });
        }}
        onNodeDragStop={async (_, n) => {
          const preview = previewDrag.current;
          if (!preview) return;
          const candidates = n.data.actor ? actors : messages;
          const centre = n.data.actor ? centreX : centreY;
          const target = candidates.reduce(
            (best, item) =>
              Math.abs(centre(item) - centre(n)) < Math.abs(centre(best) - centre(n)) ? item : best,
            candidates[0],
          );
          if (target && target.id !== n.id) {
            if (n.data.actor) await apply(() => moveLane(source, rows, n.data.actor!, target.data.actor!));
            else
              await apply(() =>
                moveMessage(
                  source,
                  rows,
                  rows.find((r) => r.start === n.data.start)!,
                  rows.find((r) => r.start === target.data.start)!,
                ),
              );
          }
          if (previewDrag.current === preview) {
            preview(0);
            previewDrag.current = null;
            setDrag(null);
          }
        }}
      >
        <ViewportPortal>
          <div
            className="sq-artboard"
            ref={setPortal}
            onDoubleClick={(e) => {
              if (tool !== 'select') return;
              const hit = (e.target as Element).closest('[data-statement]');
              if (!hit) return;
              const actor = actors.find((n) => n.data.actor === hit.getAttribute('data-sequence-actor'));
              if (actor) rename(actor.data, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
              else
                onSelect(
                  rows.find((r) => r.start === Number(hit.getAttribute('data-statement'))),
                  undefined,
                  true,
                );
            }}
            onClick={(e) => {
              const hit = (e.target as Element).closest('[data-statement]');
              if (!hit) return;
              const row = rows.find((r) => r.start === Number(hit.getAttribute('data-statement')));
              if (row) {
                e.stopPropagation();
                const actor = (e.target as Element)
                  .closest('[data-sequence-actor]')
                  ?.getAttribute('data-sequence-actor');
                const lane = actors.find((n) => n.data.actor === actor);
                const point = screenToFlowPosition({
                  x: e.clientX,
                  y: e.clientY,
                });
                if (lane) clickItem(lane.data, point);
                else if (placementKind) placeElement(placementKind, point);
                else if (tool === 'participant') place(point);
                else {
                  setGroup(undefined);
                  setActorSelected(undefined);
                  onSelect(row);
                }
              }
            }}
          >
            <Drawing svg={svg} />
          </div>
        </ViewportPortal>
        {placementGuide && (
          <ViewportPortal>
            <svg className="sq-placement-guide" style={{ overflow: 'visible' }} aria-hidden="true">
              <path
                d={
                  'M' +
                  (placementGuide.kind === 'participant'
                    ? placementGuide.point.x + ' 0v' + geometry.box.height
                    : '0 ' + placementGuide.point.y + 'h' + geometry.box.width)
                }
              />
            </svg>
          </ViewportPortal>
        )}
        {!workspaceZoom && (
          <>
            <Background
              gap={appearance.texture === 'grid' ? 24 : 18}
              variant={appearance.texture === 'grid' ? BackgroundVariant.Lines : BackgroundVariant.Dots}
            />
            <Controls showInteractive={false} showFitView={false}>
              <ControlButton title="Fit view" aria-label="Fit view" onClick={() => fit(geometry.box)}>
                <Icon name="expand" />
              </ControlButton>
            </Controls>
            <MiniMap pannable zoomable />
          </>
        )}
      </ReactFlow>
      {editor && (
        <form
          className="sq-inline"
          style={{
            left: `clamp(100px, ${editor.point.x * viewport.zoom + viewport.x}px, calc(100% - 100px))`,
            top: `clamp(64px, ${editor.point.y * viewport.zoom + viewport.y}px, calc(100% - 64px))`,
          }}
          onSubmit={(e) => {
            e.preventDefault();
            void finish();
          }}
        >
          <input
            ref={input}
            required
            aria-label={editor.label}
            placeholder={editor.label}
            value={editor.value}
            onChange={(e) => setEditor({ ...editor, value: e.target.value })}
            onBlur={(e) => {
              if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) {
                if (editor.value.trim()) void finish();
                else setEditor(null);
              }
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') {
                setEditor(null);
                onTool('select');
              }
            }}
          />
          <button type="submit" aria-label="Apply label">
            ✓
          </button>
          <button type="button" aria-label="Cancel edit" onClick={() => setEditor(null)}>
            ×
          </button>
        </form>
      )}
      {tool !== 'select' && !editor && (
        <div role="status" className="sq-hint">
          {tool === 'participant'
            ? 'Click the canvas to place a participant.'
            : sender
              ? 'Choose the receiving participant.'
              : 'Drag from sender to receiver, or click the sender.'}
        </div>
      )}
    </div>
  );
}
