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
  appendMessage,
  changeLabel,
  insertParticipant,
  moveLane,
  moveMessage,
  removeSelection,
  type CanvasEdit,
} from './canvasEdits';
import { sequenceDragPreview } from './dragPreview';
import { bindSelection } from './selection';
import type { Statement } from './model';

export type Tool = 'select' | 'participant' | 'message';
type Item = { connectFromBody?: boolean; actor?: string; start?: number; label: string; kind: string };
type HitNode = Node<Item & Record<string, unknown>, 'sequenceItem'>;
type Editor = {
  point: XYPosition;
  value: string;
  initial: string;
  label: string;
  source: string;
  edit: (value: string) => CanvasEdit;
};
export type ParticipantDrop = (client: XYPosition) => void;
interface Props {
  ref: React.Ref<ParticipantDrop>;
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
  const [geometry, setGeometry] = useState<{ source: string; nodes: HitNode[]; box: typeof emptyBox }>({
    source: '',
    nodes: [],
    box: emptyBox,
  });
  const [drag, setDrag] = useState<{ id: string; position: XYPosition } | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
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
          getViewportForBounds(box, root.current.clientWidth, root.current.clientHeight, 0.05, workspaceZoom ?? 1, 0.3),
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
    const box = { x: view.x, y: view.y, width: view.width, height: view.height };
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
    setSender(undefined);
    setActorSelected(undefined);
    setDrag(null);
    setGroup(undefined);
  }, [source, tool]);
  const canEdit = editable && source === geometry.source;
  const actors = geometry.nodes.filter((n) => n.data.actor).sort((a, b) => centreX(a) - centreX(b));
  const messages = geometry.nodes.filter((n) => n.data.kind === 'message');
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
        draggable: canEdit && tool === 'select' && n.data.kind !== 'note' && !editor,
        connectable: canEdit && tool !== 'participant' && !editor,
        ...(drag?.id === n.id && { position: drag.position, dragging: true }),
      })),
    [geometry, drag, selected, selectedActor, activeActor, tool, canEdit, editor, group],
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
  function message(from: string, to: string, point: XYPosition) {
    setSender(undefined);
    begin(point, 'Message label', '', (value) => appendMessage(source, from, to, value));
  }
  const laneAfter = (point: XYPosition) => actors.find((n) => centreX(n) > point.x)?.data.actor;
  useImperativeHandle(ref, () => (client) => {
    const el = document.elementFromPoint(client.x, client.y);
    const board = root.current?.closest('.sq-board');
    if (
      !canEdit ||
      !board?.contains(el) ||
      !el?.closest('.react-flow,.sq-empty') ||
      el.closest('.react-flow__panel')
    )
      return;
    apply(() => insertParticipant(source, rows, laneAfter(screenToFlowPosition(client)), ''));
    onTool('select');
  });
  function place(point: XYPosition) {
    const before = laneAfter(point);
    begin(point, 'Participant label', '', (value) => insertParticipant(source, rows, before, value));
  }
  function clickItem(data: Item, point: XYPosition) {
    if (!canEdit) {
      selectItem(data);
      return;
    }
    if (tool === 'participant') {
      place(point);
      return;
    }
    if (tool === 'message' && data.actor) {
      if (sender) message(sender, data.actor, point);
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
    { key: 't', run: () => useDock.setState({ open: true, view: 'appearance' }) },
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
        selectionOnDrag={tool === 'select'}
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
            apply(() => appendMessage(source, a.data.actor!, b.data.actor!, ''));
            setSender(undefined);
            onTool('select');
          }
        }}
        onPaneClick={(e) => {
          if (editor) return;
          if (tool === 'participant') place(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
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
                const point = screenToFlowPosition({ x: e.clientX, y: e.clientY });
                if (lane) clickItem(lane.data, point);
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
