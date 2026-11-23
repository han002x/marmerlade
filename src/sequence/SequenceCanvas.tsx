import { createPortal } from 'react-dom';
import { useWorkspaceZoom } from '../diagrams/useWorkspaceZoom';
import { showDeck, showPage, useDock } from '../dock';
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
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
import { PageButton } from '../components/PageButton';
import { DeckButton } from '../components/DeckButton';
import { participantOwner } from '../linkOwners';
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
import { bindSelection, summary } from './selection';
import { RailProperties, type PropertyFocus } from './RailProperties';
import { applySequenceStyles } from './applyStyles';
import { addMessageTraces } from './messageTraces';
import { actorKey, statementKey } from './styleMap';
import { StyleFields } from '../components/StylePanel';
import { useDiagram } from '../store';
import { blocks, nameOf, type Statement } from './model';
import { wrappable } from './insertion';

export type Tool = 'select' | 'participant' | 'message';
type Item = {
  connectFromBody?: boolean;
  actor?: string;
  /** link owner id of a participant's header, for its page and slides buttons */
  owner?: string;
  footer?: boolean;
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
type Properties = {
  content: ReactNode;
  label: string;
  cancel: () => void;
  focus?: PropertyFocus;
};
interface Props {
  ref: React.Ref<PlacementHandle>;
  placementKind?: string;
  onPlace: (kind: string, at: number, selected: Statement[], actor?: string) => void;
  onInsert: (build: () => CanvasEdit) => void;
  workspaceZoom?: number;
  svg: string;
  source: string;
  rows: Statement[];
  messageSteps?: ReadonlyMap<number, number>;
  selected?: Statement;
  selectedActor?: string;
  /** The sequence's diagram id; set, participants get page and slides buttons. */
  diagramId?: string;
  /** Host for the floating element panel (the board-level style-panel slot). */
  panel: HTMLElement | null;
  controls?: ReactNode;
  properties?: Properties;
  editable: boolean;
  tool: Tool;
  onTool: (tool: Tool) => void;
  onSelect: (row?: Statement, actor?: string, inspect?: boolean) => void;
  onCommit: (source: string, at: number) => Promise<boolean>;
  onError: (error: string) => void;
  onSource: () => void;
  /** A palette or property preview, drawn in place of the diagram. */
  previewSvg?: string;
  fitPreview: boolean;
  /** The position, among the preview's messages, of a palette sample to draw dotted. */
  sampleMessage?: number;
  /** Whether the single selected statement was picked by the user and may be wrapped by a block. */
  wrapSelected: boolean;
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
      {data.actor && !data.footer && (
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
      {data.actor && !data.footer && <SideHandles connectable={isConnectable} />}
      {data.owner && <PageButton owner={data.owner} />}
      {data.owner && <DeckButton owner={data.owner} />}
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
  onInsert,
  workspaceZoom,
  svg,
  source,
  rows,
  messageSteps,
  selected,
  selectedActor,
  diagramId,
  panel,
  controls,
  properties,
  editable,
  tool,
  onTool,
  onSelect,
  onCommit,
  onError,
  onSource,
  previewSvg,
  fitPreview,
  sampleMessage,
  wrapSelected,
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
    targets: Map<number, SVGGraphicsElement>;
  }>({
    source: '',
    nodes: [],
    box: emptyBox,
    targets: new Map(),
  });
  const [drag, setDrag] = useState<{ id: string; position: XYPosition } | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [placementGuide, setPlacementGuide] = useState<{
    kind: string;
    point: XYPosition;
    lane?: number;
  }>();
  const [pointer, setPointer] = useState<XYPosition>();
  const [messageAt, setMessageAt] = useState<number>();
  const [sender, setSender] = useState<string>();
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
  const inlineEntry = useRef<HTMLElement | SVGElement | null>(null);
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
      setGeometry({ source, nodes: [], box: emptyBox, targets: new Map() });
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
          ...(diagramId && { owner: participantOwner(diagramId, actor) }),
          label:
            rows.find((r) => r.kind === 'participant' && r.values[0] === actor)?.values[1] ||
            el.querySelector('text')?.textContent ||
            actor,
          kind: 'Participant',
        });
    }
    // The footer box selects its participant like the header, but is not a lane of its own.
    for (const el of drawing.querySelectorAll('[data-sequence-actor]')) {
      const actor = el.getAttribute('data-sequence-actor');
      if (actor && (el.matches('.actor-bottom') || el.querySelector('.actor-bottom')))
        add([el], 'footer:' + actor, { actor, footer: true, label: nodes.find((n) => n.id === 'actor:' + actor)?.data.label ?? actor, kind: 'Participant' });
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
    const targets = new Map<number, SVGGraphicsElement>();
    for (const element of drawing.querySelectorAll<SVGGraphicsElement>('[data-statement]:not([data-sequence-actor])')) {
      const start = Number(element.getAttribute('data-statement'));
      if (!targets.has(start)) targets.set(start, element);
    }
    for (const row of rows) {
      const element = targets.get(row.start);
      if (!element || ['message', 'note'].includes(row.kind)) continue;
      element.setAttribute('tabindex', '0');
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', summary(row));
    }
    setGeometry({ source, nodes, box, targets });
    if (!hasFitted.current) {
      hasFitted.current = true;
      fit(box);
    }
  }, [portal, svg, rows, source, fit, diagramId]);

  const sequenceStyles = useDiagram((s) => s.sequenceStyles);
  const updateSequenceStyle = useDiagram((s) => s.updateSequenceStyle);
  // After binding, so the drawing's elements already carry their statements.
  useLayoutEffect(() => {
    const drawing = portal?.querySelector('svg');
    if (!drawing) return;
    applySequenceStyles(drawing, rows, sequenceStyles);
    if (messageSteps?.size) return addMessageTraces(drawing, messageSteps);
  }, [portal, svg, rows, sequenceStyles, messageSteps]);

  const inlinePoint = editor?.point;
  useEffect(() => {
    if (!inlinePoint) return;
    const previous = inlineEntry.current;
    const canvas = root.current;
    input.current?.focus();
    input.current?.select();
    return () => {
      requestAnimationFrame(() => {
        if (document.activeElement !== document.body) return;
        const target = previous?.isConnected && previous !== document.body ? previous : canvas;
        if (target?.isConnected) target.focus({ preventScroll: true });
      });
    };
  }, [inlinePoint]);
  useEffect(() => {
    setEditor(null);
    setDrag(null);
    setGroup(undefined);
  }, [source, tool]);
  useEffect(() => {
    setSender(undefined);
    setMessageAt(undefined);
  }, [source]);
  useEffect(() => {
    if (tool === 'message') return;
    setSender(undefined);
    setMessageAt(undefined);
    setPointer(undefined);
  }, [tool]);
  useEffect(() => {
    if (!placementKind && tool !== 'participant') setPlacementGuide(undefined);
  }, [placementKind, tool]);
  const previewBox = useMemo(() => {
    const view = /viewBox="([^"]+)"/.exec(previewSvg ?? '')?.[1].trim().split(/[\s,]+/).map(Number);
    return view?.length === 4 && view.every(Number.isFinite)
      ? { x: view[0], y: view[1], width: view[2], height: view[3] }
      : undefined;
  }, [previewSvg]);
  const previewRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const lines = previewRef.current?.querySelectorAll('[data-et="message"]') ?? [];
    lines.forEach((line, i) => line.classList.toggle('sq-sample', i === sampleMessage));
  }, [previewSvg, previewBox, sampleMessage]);
  // Keep a growing preview in view; the committed drawing keeps the same scale otherwise.
  useLayoutEffect(() => {
    const area = root.current;
    if (!previewBox || !area || !fitPreview) return;
    const { x, y, zoom } = viewport;
    const left = previewBox.x * zoom + x,
      top = previewBox.y * zoom + y;
    if (
      left < 0 ||
      top < 0 ||
      left + previewBox.width * zoom > area.clientWidth ||
      top + previewBox.height * zoom > area.clientHeight
    )
      fit(previewBox);
    // Only a new preview may move the view; panning afterwards stays with the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewBox, fit, fitPreview]);
  const canEdit = editable && source === geometry.source;
  const actors = geometry.nodes.filter((n) => n.data.actor && !n.data.footer).sort((a, b) => centreX(a) - centreX(b));
  const messages = geometry.nodes
    .filter((n) => n.data.kind === 'message')
    .sort((a, b) => centreY(a) - centreY(b));
  const activeActor =
    sender ??
    selectedActor ??
    (selected?.kind === 'participant' ? selected.values[0] : undefined);
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
      (previewSvg ? [] : geometry.nodes).map((n) => ({
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
          !n.data.footer &&
          ['Participant', 'message'].includes(n.data.kind) &&
          !editor,
        connectable: canEdit && !placementKind && !n.data.footer && tool !== 'participant' && !editor,
        ...(drag?.id === n.id && { position: drag.position, dragging: true }),
      })),
    [geometry, drag, selected, selectedActor, activeActor, tool, canEdit, editor, group, placementKind, previewSvg],
  );

  async function apply(edit: () => CanvasEdit) {
    if (!canEdit || previewSvg) return false;
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
    const row = data.actor
      ? rows.find((r) => r.kind === 'participant' && r.values[0] === data.actor)
      : rows.find((r) => r.start === data.start);
    onSelect(row, data.actor);
  }
  function begin(point: XYPosition, label: string, value: string, edit: Editor['edit']) {
    if (!canEdit) return;
    const active = document.activeElement;
    inlineEntry.current = active instanceof HTMLElement || active instanceof SVGElement ? active : null;
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
  function insertMessage(from: string, to: string) {
    if (!canEdit) return;
    const at =
      messageAt ??
      (selected?.kind === 'participant'
        ? source.length
        : (selected?.close?.start ?? selected?.end ?? source.length));
    onInsert(() => insertElement(source, from + '->>' + to + ': Message', 'message', at));
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
        : wrapSelected && row === selected,
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
    if (kind === 'participant') onInsert(() => insertParticipant(source, rows, laneAfter(point), ''));
    else if (kind === 'message') {
      setMessageAt(slot(point));
      setSender(actor);
      onTool('message');
    } else if (kind === 'box' && !wrappable(kind, selectedRows()).length) {
      // A box needs participants to be drawn, so group the clicked lane.
      const lane = rows.filter((r) => r.kind === 'participant' && r.values[0] === actor);
      onPlace(kind, lane[0]?.start ?? source.length, lane, actor);
    } else onPlace(kind, slot(point), selectedRows(), actor);
  }
  const laneKinds = ['note', 'activate', 'deactivate', 'destroy'];
  function guideAt(kind: string, point: XYPosition) {
    if (blocks.includes(kind) && (kind === 'box' || wrappable(kind, selectedRows()).length)) return undefined;
    const nearest = actors.reduce<HitNode | undefined>(
      (best, node) =>
        !best || Math.abs(centreX(node) - point.x) < Math.abs(centreX(best) - point.x) ? node : best,
      undefined,
    );
    const next = messages.find((node) => centreY(node) > point.y);
      const previous = messages.filter((node) => centreY(node) <= point.y).at(-1);
      const before = actors.find((node) => centreX(node) > point.x);
      const left = actors.filter((node) => centreX(node) <= point.x).at(-1);
      return {
        kind,
        lane: laneKinds.includes(kind) && nearest ? centreX(nearest) : undefined,
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
      };
  }
  useImperativeHandle(ref, () => ({
    move(kind, client) {
      if (!root.current?.contains(document.elementFromPoint(client.x, client.y))) {
        setPlacementGuide(undefined);
        return;
      }
      setPlacementGuide(guideAt(kind, screenToFlowPosition(client)));
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
      if (placementKind !== 'box' && data.kind === 'emptyBlock' && block?.close)
        onPlace(placementKind, block.close.start, []);
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
      // Choosing the sender is part of drawing the message, so the inspector keeps its current item.
      if (sender) insertMessage(sender, data.actor);
      else setSender(data.actor);
    } else selectItem(data);
  }
  const nameFor = (id: string) =>
    rows.find((r) => r.kind === 'participant' && r.values[0] === id)?.values[1] || id;
  function hint() {
    if (placementKind) {
      const name = nameOf(placementKind).toLowerCase();
      const targets = wrappable(placementKind, selectedRows());
      if (targets.length)
        return (
          'Click anywhere to wrap the ' +
          (targets.length === 1 ? 'selected ' + targets[0].kind : targets.length + ' selected ' + targets[0].kind + 's') +
          ' in ' + (/^[aeiou]/.test(name) ? 'an ' : 'a ') + name + '. Escape cancels.'
        );
      if (placementKind === 'box')
        return 'Click a participant to put it in a box. To group several, select them first. Escape cancels.';
      if (blocks.includes(placementKind))
        return (
          'Click between messages to add ' + (/^[aeiou]/.test(name) ? 'an ' : 'a ') + name +
          ' there. Select messages first to wrap them. Escape cancels.'
        );
      return 'Click a lane at the point in time for the ' + name + '. Escape cancels.';
    }
    if (tool === 'participant') return 'Click where the new lane should go. Escape cancels.';
    return sender
      ? 'From ' + nameFor(sender) + ': click the receiver, or ' + nameFor(sender) + ' again for a self-message. Escape cancels.'
      : 'Click the sender, or drag from one participant to another. Escape cancels.';
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
        onSelect();
      },
    },
    { key: 'v', run: () => onTool('select') },
    { key: 'r', run: () => canEdit && onTool('participant') },
    // W / K: the selected participant's page or slides, as on a flowchart node
    {
      key: 'w',
      run: () => {
        const owner = useDock.getState().participant;
        if (owner) showPage(owner);
      },
    },
    {
      key: 'k',
      run: () => {
        const owner = useDock.getState().participant;
        if (owner) showDeck(owner);
        else useDock.setState({ open: true, view: 'slides' });
      },
    },
    {
      key: 't',
      run: () => useDock.setState({ open: true, view: 'appearance' }),
    },
    { key: 'm', run: onSource },
  ]);

  const selectedLane = selectedActor ?? (selected?.kind === 'participant' ? selected.values[0] : undefined);
  const hiddenRows = geometry.source === source ? rows.filter((row) =>
    row.kind !== 'end' && (row.kind === 'participant'
      ? !actors.some((actor) => actor.data.actor === row.values[0])
      : !geometry.targets.has(row.start)),
  ) : [];
  const selecting = tool === 'select' && !placementKind;
  const showControls = selecting && !group && !drag && !joining && !editor;
  // Style keys of the selection: participants by id, other statements by position.
  const keyOf = (id: string) => {
    const at = id.indexOf(':');
    const [kind, rest] = [id.slice(0, at), id.slice(at + 1)];
    if (kind === 'actor' || kind === 'footer') return actorKey(rest);
    const row = kind === 'row' || kind === 'empty' ? rows.find((item) => item.start === Number(rest)) : undefined;
    return row && statementKey(rows, row);
  };
  const styleKeys = [
    ...new Set(
      (group
        ? group.map(keyOf)
        : [selectedLane ? actorKey(selectedLane) : selected && statementKey(rows, selected)]
      ).filter((key): key is string => !!key),
    ),
  ];
  const styleKinds = styleKeys.map((key) => (key.startsWith('p:') ? 'participant' : rows[Number(key.slice(2))]?.kind));
  const showStyle = selecting && !drag && !joining && !editor && styleKeys.length > 0;
  const styleLabel = (() => {
    if (styleKeys.length !== 1) return styleKeys.length > 1 ? `${styleKeys.length} elements` : '';
    const key = styleKeys[0];
    if (key.startsWith('p:')) {
      const id = key.slice(2);
      const row = rows.find((item) => item.kind === 'participant' && item.values[0] === id);
      return row?.values[1] || id;
    }
    const row = rows[Number(key.slice(2))];
    return row ? summary(row) : '';
  })();
  const panelOpen = Boolean((showControls && controls) || properties || showStyle);
  const panelContent = (
    <aside className="mf-style-panel sq-rail-content" aria-label="Sequence editing" onPointerMove={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key === 'Escape') {
        const details = event.target instanceof HTMLElement && event.target.closest('details[open]');
        if (details instanceof HTMLDetailsElement) {
          details.open = false;
          details.querySelector('summary')?.focus();
        } else if (properties) properties.cancel();
        else onSelect();
        event.preventDefault();
        event.stopPropagation();
      } else if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') {
        event.stopPropagation();
      }
    }}>
      {showStyle && styleLabel && <div className="mf-panel-head"><span className="mf-panel-title">{styleLabel}</span></div>}
      {showControls && controls && (
        <fieldset
          key={'tools:' + (selectedLane ?? selected?.start)}
          aria-label="Element controls"
          disabled={!canEdit}
          className="sq-tool-buttons"
        >
          {controls}
        </fieldset>
      )}
      {properties && (
        <RailProperties
          key={selectedLane ?? selected?.start}
          label={properties.label}
          focus={properties.focus}
          canvas={root}
        >
          {properties.content}
        </RailProperties>
      )}
      {showStyle && (
        <div className="sq-style">
          <div className="sq-style-fields">
            <StyleFields
              styles={styleKeys.map((key) => sequenceStyles[key] ?? {})}
              patch={(patch) => updateSequenceStyle(styleKeys, patch)}
              resetKey={styleKeys.join(',')}
              background={styleKinds.some((kind) => kind !== 'message')}
              corners={styleKinds.some((kind) => ['participant', 'note', 'rect', 'box'].includes(kind))}
              // Mermaid draws sequences with clean lines.
              defaults={{ sloppiness: 0 }}
              animations={{
                nodes: styleKinds.some((kind) => kind !== 'message'),
                edges: styleKinds.includes('message'),
              }}
            />
          </div>
        </div>
      )}
      {selecting && hiddenRows.length > 0 && (
        <details className="sq-rail-statements" open>
          <summary>Diagram statements</summary>
          <ul>
            {hiddenRows.map((row) => (
              <li key={row.start}>
                <button
                  disabled={!canEdit}
                  onClick={() => onSelect(row, undefined, true)}
                >
                  {summary(row)}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </aside>
  );
  return (
    <div
      className={
        'mf-canvas sq-flow' + (joining ? ' is-connecting' : '') + (tool !== 'select' || placementKind ? ' is-placing' : '')
      }
      ref={root}
      aria-label="Sequence canvas"
      tabIndex={-1}
      onPointerMove={(event) => {
        const placing = placementKind ?? (tool === 'participant' ? 'participant' : undefined);
        if (!placing && !(tool === 'message' && sender)) return;
        const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        setPointer(point);
        if (placing) setPlacementGuide(guideAt(placing, point));
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || tool !== 'select' || placementKind || !canEdit || !(event.target instanceof Element)) return;
        const nodeId = event.target.closest('.react-flow__node')?.getAttribute('data-id');
        const node = geometry.nodes.find((item) => item.id === nodeId);
        const target = event.target.closest('[data-statement]');
        if (!node && !target) return;
        const actor = node?.data.actor;
        const row = actor
          ? rows.find((item) => item.kind === 'participant' && item.values[0] === actor)
          : rows.find((item) => item.start === (node?.data.start ?? Number(target?.getAttribute('data-statement'))));
        event.preventDefault();
        event.stopPropagation();
        setGroup(undefined);
        onSelect(row, actor, true);
      }}
      onPointerLeave={() => {
        setPointer(undefined);
        if (placementKind || tool === 'participant') setPlacementGuide(undefined);
      }}
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
        onDoubleClick={(e) => {
          if (tool === 'select' && !placementKind && (e.target as Element).classList.contains('react-flow__pane'))
            fit(geometry.box);
        }}
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
          properties?.cancel();
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
        connectOnClick={tool === 'select' && !placementKind}
        connectionMode={ConnectionMode.Loose}
        connectionLineComponent={JoinPreview}
        onConnectStart={() => setJoining(true)}
        onConnectEnd={() => setJoining(false)}
        onConnect={({ source: from, target: to }) => {
          const a = actors.find((n) => n.id === from),
            b = actors.find((n) => n.id === to);
          if (a?.data.actor && b?.data.actor) {
            insertMessage(a.data.actor, b.data.actor);
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
            onSelect();
          }
        }}
        onNodeClick={(e, n) => {
          if (tool === 'select' && !placementKind && (e.shiftKey || e.ctrlKey || e.metaKey)) {
            properties?.cancel();
            const ids = nodes.filter((node) => node.selected).map((node) => node.id);
            setGroup(ids.includes(n.id) ? ids.filter((id) => id !== n.id) : [...ids, n.id]);
          } else clickItem(n.data, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
        }}
        onNodeDoubleClick={(e, n) => {
          if (tool !== 'select' || placementKind) return;
          if (n.data.kind === 'emptyBlock') {
            onSelect(rows.find((row) => row.start === n.data.start), undefined, true);
          } else rename(n.data, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
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
            className={'sq-artboard' + (previewSvg ? ' is-replaced' : '')}
            ref={setPortal}
            onDoubleClick={(e) => {
              if (tool !== 'select' || placementKind) return;
              const hit = (e.target as Element).closest('[data-statement]');
              if (!hit) {
                fit(geometry.box);
                return;
              }
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
                  onSelect(row);
                }
              }
            }}
          >
            <Drawing svg={svg} />
          </div>
          {previewSvg && previewBox && (
            <div
              ref={previewRef}
              className="sq-artboard sq-preview-artboard"
              aria-label="Preview drawing"
              style={{ left: previewBox.x, top: previewBox.y, width: previewBox.width, height: previewBox.height }}
            >
              <Drawing svg={previewSvg} />
            </div>
          )}
        </ViewportPortal>
        {placementGuide && !previewSvg && (
          <ViewportPortal>
            <svg className="sq-placement-guide" style={{ overflow: 'visible' }} aria-hidden="true">
              <path
                d={
                  'M' +
                  (placementGuide.kind === 'participant'
                    ? placementGuide.point.x + ' ' + geometry.box.y + 'v' + geometry.box.height
                    : geometry.box.x + ' ' + placementGuide.point.y + 'h' + geometry.box.width)
                }
              />
              {placementGuide.lane !== undefined && (
                <circle cx={placementGuide.lane} cy={placementGuide.point.y} r="6" />
              )}
            </svg>
          </ViewportPortal>
        )}
        {tool === 'message' && sender && pointer && !previewSvg && (
          <ViewportPortal>
            <svg className="sq-placement-guide sq-message-guide" style={{ overflow: 'visible' }} aria-hidden="true">
              {(() => {
                const from = actors.find((node) => node.data.actor === sender);
                if (!from) return null;
                const x = centreX(from),
                  y = pointer.y,
                  tip = Math.sign(pointer.x - x) || 1;
                return (
                  <path d={`M${x} ${y}H${pointer.x}m${-8 * tip} -5l${8 * tip} 5l${-8 * tip} 5`} />
                );
              })()}
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
            <MiniMap pannable zoomable style={{ width: 130, height: 90 }} />
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
      {panel && panelOpen && createPortal(panelContent, panel)}
      {(tool !== 'select' || placementKind) && !editor && !previewSvg && (
        <div role="status" className="sq-hint">
          {hint()}
        </div>
      )}
    </div>
  );
}
