import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useKeyPress,
  useReactFlow,
  useViewport,
  useStore,
  type XYPosition,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { useDiagram, workspaceDiagram } from '../store';
import { diagramEntities, uniqueTitle } from '../diagramEntities';
import type { DiagramEntity } from '../types';
import { toMermaid } from '../mermaid/io';
import { diagramSvg } from '../mermaid/svg';
import { bindSelection } from '../sequence/selection';
import { applySequenceStyles } from '../sequence/applyStyles';
import { statements } from '../sequence/model';
import { activeAppearance, useAppearance } from '../theme';
import { exportFile, importFile, saveForNavigation } from '../persist';
import { useHash, parseRoute, openDocs } from '../route';
import ProductNav from '../components/ProductNav';
import BrandMark from '../components/BrandMark';
import { DragPlacement } from '../components/DragPlacement';
import { Icon } from '../components/Icon';
import { NodeTransforms, type ResizePreview } from '../components/NodeTransforms';
import { boundsOf, snapMove, type Guide } from '../canvasTransform';
import './diagrams.css';

import { MermaidPanel, FlowchartSource } from '../components/MermaidPanel';
import { useDock } from '../dock';
import { useHotkeys } from '../useHotkeys';
import { settleFoldMotion } from '../foldMotion';
import { WorkspaceTree } from './WorkspaceTree';
import { DiagramName } from './DiagramName';
import { ToolbarMenu } from './ToolbarMenu';
import type { EditorSlots, SequenceTarget } from './editorSlots';
const SequenceEditor = lazy(() => import('../sequence/SequenceEditor'));
type EntityNode = Node<
  {
    entity: DiagramEntity;
    editing: boolean;
    open: (id: string) => void;
    close: () => void;
    rename: (id: string, title: string) => void;
    duplicate: (id: string) => void;
    remove: (id: string) => void;
  },
  'diagram'
>;
function DiagramFrame({ data }: NodeProps<EntityNode>) {
  const { entity, editing } = data;
  const appearance = activeAppearance(useAppearance());
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const flow = entity.kind === 'flowchart' ? entity : undefined;
  const sequence = entity.kind === 'sequence' ? entity.source : undefined;
  const source = useMemo(
    () => sequence ?? toMermaid({ nodes: flow?.nodes ?? [], edges: flow?.edges ?? [] }),
    [sequence, flow?.nodes, flow?.edges],
  );
  useEffect(() => {
    if (editing) return;
    const abort = new AbortController();
    void diagramSvg(source, appearance).then(
      (value) => {
        if (!abort.signal.aborted) {
          setSvg(value);
          setError('');
        }
      },
      (reason) => {
        if (!abort.signal.aborted) setError(String(reason));
      },
    );
    return () => {
      abort.abort();
    };
  }, [source, appearance, editing]);
  const preview = useRef<HTMLDivElement>(null);
  // Tag the drawn sequence elements with their source statements so hovering and clicking can find them,
  // then paint their styles. The preview is rebuilt when its editor closes, so this runs again then.
  const sequenceStyles = entity.kind === 'sequence' ? entity.styles : undefined;
  useEffect(() => {
    const drawing = preview.current?.querySelector('svg');
    if (!svg || !sequence || !drawing) return;
    const rows = statements(sequence);
    bindSelection(drawing, rows);
    applySequenceStyles(drawing, rows, sequenceStyles);
  }, [svg, sequence, sequenceStyles, editing]);
  return (
    <article className={'diagram-entity' + (editing ? ' is-editing' : '')} aria-label={entity.title} data-diagram-id={entity.id}>
      <header className="diagram-title">
        <DiagramName
          className="nodrag workspace-nopan"
          value={entity.title}
          onSave={(title) => data.rename(entity.id, title)}
        />
        <button
          className="nodrag workspace-nopan"
          type="button"
          aria-label="Duplicate diagram"
          title="Duplicate diagram"
          onClick={() => data.duplicate(entity.id)}
        >
          <Icon name="copy" />
        </button>
        <button
          className="nodrag workspace-nopan"
          type="button"
          aria-label="Delete diagram"
          title="Delete diagram"
          onClick={() => data.remove(entity.id)}
        >
          <Icon name="trash" />
        </button>
      </header>
      {!editing && (
        <div
          className="diagram-preview"
          ref={preview}
          onPointerMove={(event) => {
            const frame = event.currentTarget;
            const hit = previewNodeAt(frame, event.clientX, event.clientY)?.els ?? [];
            for (const el of frame.querySelectorAll('.is-hovered')) if (!hit.includes(el)) el.classList.remove('is-hovered');
            for (const el of hit) el.classList.add('is-hovered');
          }}
          onPointerLeave={(event) => {
            for (const el of event.currentTarget.querySelectorAll('.is-hovered')) el.classList.remove('is-hovered');
          }}
        >
          {error ? (
            <p role="alert">{error}</p>
          ) : svg ? (
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <p>Click to edit this diagram</p>
          )}
        </div>
      )}
    </article>
  );
}
const nodeTypes = { diagram: DiagramFrame };

/** The flowchart node or sequence element drawn under a point inside a diagram preview, if any. */
function previewNodeAt(frame: Element | null | undefined, x: number, y: number) {
  const pad = 5; // sequence arrows and lifelines are only a pixel or two thick
  let best: { id?: string; target?: SequenceTarget; els: Element[]; area: number } | undefined;
  const consider = (el: Element, area: number, id?: string, target?: SequenceTarget, els = [el]) => {
    if (!best || area < best.area) best = { id, target, els, area };
  };
  const inside = (el: Element, margin: number) => {
    const r = el.getBoundingClientRect();
    if (x < r.left - margin || x > r.right + margin || y < r.top - margin || y > r.bottom + margin) return 0;
    return (r.width + 2 * margin) * (r.height + 2 * margin);
  };
  for (const el of frame?.querySelectorAll('.diagram-preview svg :is(g.node, g.rough-node)[id]') ?? []) {
    const id = /-flowchart-(.+)-\d+$/.exec(el.id)?.[1];
    const area = id ? inside(el, 0) : 0;
    if (area) consider(el, area, id);
  }
  const svg = frame?.querySelector('.diagram-preview svg');
  for (const el of svg?.querySelectorAll('[data-statement],[data-sequence-actor]') ?? []) {
    if (el.getAttribute('data-et') === 'life-line' || el.hasAttribute('data-sequence-decoration')) continue;
    const area = inside(el, pad);
    if (!area) continue;
    const start = el.getAttribute('data-statement');
    const actor = el.getAttribute('data-sequence-actor');
    const target: SequenceTarget | undefined = actor
      ? { kind: 'participant', id: actor }
      : start
        ? { kind: 'statement', start: Number(start) }
        : undefined;
    // An arrow and its label text share one statement, so they light up together.
    const els = actor
      ? [...svg!.querySelectorAll('[data-sequence-actor]')].filter((e) => e.getAttribute('data-sequence-actor') === actor && e.getAttribute('data-et') !== 'life-line')
      : [...svg!.querySelectorAll('[data-statement]')].filter((e) => e.getAttribute('data-statement') === start);
    if (target) consider(el, area, undefined, target, els);
  }
  return best;
}

type FlowchartEditor = ComponentType<{ showWelcome: boolean; diagramKind: 'flowchart'; slots: EditorSlots }>;

function Board({ Editor }: { Editor: FlowchartEditor }) {
  const state = useDiagram();
  const [error, setError] = useState('');
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const [stylePanel, setStylePanel] = useState<HTMLDivElement | null>(null);
  const [sequenceOutline, setSequenceOutline] = useState<HTMLDivElement | null>(null);
  const [sequenceSource, setSequenceSource] = useState<HTMLDivElement | null>(null);
  const [sequenceTarget, setSequenceTarget] = useState<{ id: string; target: SequenceTarget }>();
  const [drafts] = useState(() => new Map<string, string>());
  const compact = useStore((s) => s.width < 600);
  const panelOpen = useDock((s) => s.open);
  const setPanelOpen = useDock((s) => s.setOpen);
  const [panelWidth, setPanelWidth] = useState(360);
  const entities = useMemo(() => diagramEntities(workspaceDiagram(state)), [state]);
  const active = state.activeDiagramId;
  const hash = useHash();
  const { screenToFlowPosition, setCenter, getViewport, setViewport, fitView } = useReactFlow();
  const viewport = useViewport();
  const panning = useKeyPress('Space');
  const appearance = activeAppearance(useAppearance());
  const [placement, setPlacement] = useState<DiagramEntity['kind']>();
  const [cursor, setCursor] = useState<XYPosition>();
  const [dragPositions, setDragPositions] = useState<Map<string, XYPosition>>();
  const [resizePreview, setResizePreview] = useState<ResizePreview | null>(null);
  const [moveGuides, setMoveGuides] = useState<Guide[]>([]);
  const displayEntities = entities.map((entity) => {
    const rect = resizePreview?.rects.get(entity.id);
    return rect ? { ...entity, position: { x: rect.x, y: rect.y }, size: { width: rect.width, height: rect.height } } : entity;
  });
  const opened = displayEntities.find((entity) => entity.id === active);
  const diagramRects = useMemo(() => new Map(entities.map((entity) => [entity.id, { ...entity.position, ...entity.size }])), [entities]);
  const titleHeight = 40;
  /** Where the dragged diagrams land once snapped to the edges and centres of the other diagrams. */
  function snapDrag(group: { id: string; position: XYPosition }[]) {
    const moving = group.flatMap((item) => {
      const rect = diagramRects.get(item.id);
      return rect ? [{ ...rect, ...item.position }] : [];
    });
    const others = [...diagramRects].filter(([id]) => !group.some((item) => item.id === id)).map(([, rect]) => rect);
    const bounds = boundsOf(moving);
    const snap = bounds ? snapMove(bounds, others, viewport.zoom) : { offset: { x: 0, y: 0 }, guides: [] };
    const positions = new Map(
      group.map((item) => [item.id, { x: item.position.x + snap.offset.x, y: item.position.y + snap.offset.y }]),
    );
    return { positions, guides: snap.guides };
  }
  const [expansion, setExpansion] = useState(new Map<string, boolean>());
  const [selection, setSelection] = useState<string[]>([]);
  const [history, setHistory] = useState<DiagramEntity[][]>([]);
  const file = useRef<HTMLInputElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const pan = useRef<{ pointerId: number; client: XYPosition; view: ReturnType<typeof getViewport> } | null>(
    null,
  );

  const setDiagrams = state.setDiagrams;
  const save = useCallback((next: DiagramEntity[]) => {
    setHistory((past) => [...past.slice(-99), entities]);
    setDiagrams(next);
  }, [entities, setDiagrams]);
  const commitResize = useCallback((rects: ResizePreview['rects']) => {
    if (!rects.size) return;
    save(entities.map((entity) => {
      const rect = rects.get(entity.id);
      return rect ? { ...entity, position: { x: rect.x, y: rect.y }, size: { width: rect.width, height: rect.height } } : entity;
    }));
  }, [entities, save]);
  function rememberExpanded(id: string) {
    setExpansion((previous) => (previous.has(id) ? previous : new Map(previous).set(id, true)));
  }
  function open(id: string) {
    if (active === id) return;
    setPlacement(undefined);
    setCursor(undefined);
    settleFoldMotion();
    useDock.setState({ page: null, deck: null });
    setSequenceTarget(undefined);
    setSelection([id]);
    state.openDiagram(id);
    rememberExpanded(id);
  }
  function defaultDiagram() {
    const current = useDiagram.getState();
    const diagrams = diagramEntities(workspaceDiagram(current));
    return diagrams.find((entity) => entity.kind === 'flowchart') ?? diagrams[0];
  }
  const followNode = useEffectEvent((initial: boolean) => {
    const route = parseRoute(hash);
    const entity =
      route.kind === 'node'
        ? entities.find((e) => e.kind === 'flowchart' && e.nodes.some((n) => n.id === route.id))
        : route.kind === 'diagram'
          ? (entities.find((e) => e.id === route.id) ??
            (route.id === 'sequence' ? entities.find((e) => e.kind === 'sequence') : undefined))
          : undefined;
    if (entity) {
      open(entity.id);
      void setCenter(entity.position.x + entity.size.width / 2, entity.position.y + entity.size.height / 2, {
        zoom: 0.85,
      });
    } else if (initial && !useDiagram.getState().activeDiagramId) {
      const fallback = defaultDiagram();
      if (fallback) open(fallback.id);
    }
  });
  const initialized = useRef(false);
  useEffect(() => {
    followNode(!initialized.current);
    initialized.current = true;
  }, [hash]);
  function reveal(id: string, centre = false) {
    const entity = entities.find((e) => e.id === id);
    const area = board.current;
    if (!entity || !area) return;
    const x = viewport.x + entity.position.x * viewport.zoom;
    const y = viewport.y + entity.position.y * viewport.zoom;
    const right = x + entity.size.width * viewport.zoom;
    const bottom = y + entity.size.height * viewport.zoom;
    // The toolbar covers the top of the board, so the title row must sit below it.
    if (centre || x < 0 || y < 64 || right > area.clientWidth || bottom > area.clientHeight)
    {
      // Computed from the stored rectangle: a just-created diagram is not measured by React Flow yet.
      const zoom = Math.min(
        centre ? 1 : Math.max(viewport.zoom, 0.6),
        (area.clientWidth - 48) / entity.size.width,
        (area.clientHeight - 96) / entity.size.height,
      );
      void setViewport(
        {
          x: (area.clientWidth - entity.size.width * zoom) / 2 - entity.position.x * zoom,
          y: 72 + (area.clientHeight - 96 - entity.size.height * zoom) / 2 - entity.position.y * zoom,
          zoom,
        },
        { duration: 180 },
      );
    }
  }
  function openFromTree(id: string) {
    open(id);
    reveal(id);
  }
  const revealActive = useEffectEvent(() => {
    if (active) reveal(active, entities.find((e) => e.id === active)?.kind === 'flowchart');
  });
  useEffect(() => {
    revealActive();
  }, [active]);
  function close() {
    settleFoldMotion();
    state.openDiagram(null);
    setSequenceTarget(undefined);
    if (['node', 'diagram'].includes(parseRoute(location.hash).kind))
      location.hash = '/diagrams';
  }
  useHotkeys(
    active
      ? []
      : [
          {
            key: 'm',
            run: () => {
              if (!active) setPanelOpen(!useDock.getState().open);
            },
          },
          {
            key: 't',
            run: () => {
              if (!active) useDock.setState({ open: true, view: 'appearance' });
            },
          },
        ],
  );
  function clientPoint(point: XYPosition) {
    const bounds = board.current?.getBoundingClientRect();
    return { x: point.x - (bounds?.left ?? 0), y: point.y - (bounds?.top ?? 0) };
  }
  function add(kind: DiagramEntity['kind'], client: XYPosition) {
    const target = document.elementFromPoint(client.x, client.y);
    if (!target || !board.current?.contains(target) || target.closest('.mf-toolbar,.mf-style-panel,.react-flow__panel,dialog'))
      return;
    const size = { width: 900, height: 650 };
    const base = {
      id: crypto.randomUUID(),
      title: uniqueTitle(entities, '', kind === 'flowchart' ? 'Flowchart' : 'Sequence'),
      position: freeSpot(screenToFlowPosition(client), size),
      size,
    };
    const entity: DiagramEntity =
      kind === 'flowchart'
        ? { ...base, kind, nodes: [], edges: [] }
        : { ...base, kind, source: 'sequenceDiagram' };
    save([...entities, entity]);
    setPlacement(undefined);
    setCursor(undefined);
    // A new diagram is created to be filled in, so open it and bring it into view.
    open(entity.id);
  }
  /** Move a new diagram right, then down, until it no longer covers an existing one. */
  function freeSpot(start: XYPosition, size: { width: number; height: number }) {
    const gap = 60;
    const hits = (p: XYPosition) =>
      entities.find(
        (e) =>
          p.x < e.position.x + e.size.width + gap &&
          p.x + size.width + gap > e.position.x &&
          p.y < e.position.y + e.size.height + gap &&
          p.y + size.height + gap > e.position.y,
      );
    const right = { ...start };
    for (let i = 0; i < entities.length; i++) {
      const hit = hits(right);
      if (!hit) return right;
      right.x = hit.position.x + hit.size.width + gap;
    }
    const below = { ...start };
    for (let i = 0; i < entities.length; i++) {
      const hit = hits(below);
      if (!hit) return below.y - start.y < right.x - start.x ? below : right;
      below.y = hit.position.y + hit.size.height + gap;
    }
    return right;
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    if (active && !previous.some((entity) => entity.id === active)) close();
    const contentById = new Map(entities.map((entity) => [entity.id, entity]));
    state.setDiagrams(
      previous.map((original) => {
        const current = contentById.get(original.id);
        return current
          ? { ...current, title: original.title, position: original.position, size: original.size }
          : original;
      }),
    );
    setHistory(history.slice(0, -1));
    setSelection([]);
  }
  /** Clear canvas: remove every diagram from the board (pages, decks and folders stay); board undo restores them. */
  function clearWorkspace() {
    if (active) close();
    save([]);
    drafts.clear();
    setSelection([]);
    setExpansion(new Map());
    setPlacement(undefined);
    setCursor(undefined);
    saveForNavigation();
  }
  function remove(ids = selection) {
    if (!ids.length) return;
    if (active && ids.includes(active)) close();
    save(entities.filter((item) => !ids.includes(item.id)));
    setSelection((current) => current.filter((id) => !ids.includes(id)));
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape' && placement) {
        setPlacement(undefined);
        setCursor(undefined);
        return;
      }
      if (placement) return;
      // While a diagram is open, Delete belongs to whatever is selected inside it; with nothing selected it removes the diagram.
      if (
        active &&
        (!selection.includes(active) ||
          document.querySelector('.react-flow__node:not(.react-flow__node-diagram).selected,.react-flow__edge.selected,.sq-selected'))
      )
        return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        remove();
      }
      if (active) return;
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && history.length) {
        event.preventDefault();
        undo();
      }
    };
    // Capture phase, so the open editor's own Delete handler hasn't yet changed what is selected inside it.
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
  const nodes: EntityNode[] = displayEntities.map((entity) => ({
    id: entity.id,
    type: 'diagram',
    position: dragPositions?.get(entity.id) ?? entity.position,
    dragging: dragPositions?.has(entity.id),
    width: entity.size.width,
    height: entity.size.height,
    zIndex: active === entity.id ? 2 : selection.includes(entity.id) ? 1 : 0,
    selected: selection.includes(entity.id),
    draggable: !placement,
    data: {
      entity,
      editing: active === entity.id,
      open,
      close,
      rename: renameDiagram,
      duplicate: (id) => duplicate([id]),
      remove: (id) => remove([id]),
    },
  }));
  /** Place a copy of `source` beside it, aligned on one axis: right, below, above, then left. */
  function copySpot(source: DiagramEntity, taken: DiagramEntity[]) {
    const gap = 60;
    const { position: p, size: s } = source;
    const free = (at: XYPosition) =>
      !taken.some(
        (e) =>
          at.x < e.position.x + e.size.width + gap &&
          at.x + s.width + gap > e.position.x &&
          at.y < e.position.y + e.size.height + gap &&
          at.y + s.height + gap > e.position.y,
      );
    const candidates = [
      { x: p.x + s.width + gap, y: p.y },
      { x: p.x, y: p.y + s.height + gap },
      { x: p.x, y: p.y - s.height - gap },
      { x: p.x - s.width - gap, y: p.y },
    ];
    const spot = candidates.find(free);
    if (spot) return spot;
    // Every side is taken: keep going right along the same row.
    const row = { ...candidates[0] };
    while (!free(row)) row.x += s.width + gap;
    return row;
  }
  function renameDiagram(id: string, title: string) {
    const from = entities.find((item) => item.id === id)?.title ?? '';
    save(
      entities.map((item) =>
        item.id === id
          ? { ...item, title: uniqueTitle(entities, id, title, item.kind === 'flowchart' ? 'Flowchart' : 'Sequence') }
          : item,
      ),
    );
    useDiagram.getState().retitle('diagram', id, from);
  }
  function duplicate(ids: string[]) {
    const placed = [...entities];
    const copies: DiagramEntity[] = [];
    for (const entity of entities.filter((item) => ids.includes(item.id))) {
      const copy = {
        ...structuredClone(entity),
        id: crypto.randomUUID(),
        title: uniqueTitle(placed, '', entity.title + ' copy'),
        position: copySpot(entity, placed),
      };
      placed.push(copy);
      copies.push(copy);
    }
    save([...entities, ...copies]);
    setSelection(copies.map((entity) => entity.id));
  }
  const workspaceActions = (
    <>
      <span className="mf-menu-sep" />
      <button
        className="mf-menu-item mf-menu-danger"
        role="menuitem"
        disabled={!entities.length}
        onClick={clearWorkspace}
      >
        <Icon name="trash" />
        <span>Clear canvas</span>
      </button>
    </>
  );
  const slots = opened
    ? {
        diagramId: opened.id,
        toolbar,
        stylePanel,
        drafts,
        workspaceActions,
        onImport: () => file.current?.click(),
        workspaceZoom: viewport.zoom,
      }
    : undefined;
  return (
    <div className="mf-app mf-workspace">
      <main
        className={'diagram-board' + (placement ? ' is-placing-diagram' : '') + (panning ? ' is-panning' : '')}
        ref={board}
        onClickCapture={(event) => {
          // The first click can replace the preview with an editor before the second click.
          if (event.detail !== 2 || placement || panning || !(event.target instanceof Element)) return;
          if (event.target.closest('input,textarea,select,button,[contenteditable="true"],.react-flow__resize-control,.sq-flow')) return;
          const id = event.target.closest<HTMLElement>('[data-diagram-id]')?.dataset.diagramId;
          if (id) void fitView({
            nodes: [{ id }],
            padding: { top: '80px', right: '32px', bottom: '32px', left: '32px' },
            duration: 250,
          });
        }}
      >
        <nav
          className={'mf-toolbar' + (compact ? ' is-compact' : '')}
          role="toolbar"
          aria-label="Workspace canvas tools"
        >
          <div className="diagram-toolbar-brand"><BrandMark decorative /><span>marmerlade</span></div>
          <ToolbarMenu label="Add diagram" icon="plus">
            {(closeMenu) =>
              (['flowchart', 'sequence'] as const).map((kind) => {
                const title = kind === 'flowchart' ? 'Flowchart' : 'Sequence';
                return (
                  <DragPlacement
                    key={kind}
                    previewLabel={title}
                    onDrop={(point) => {
                      add(kind, point);
                      closeMenu();
                    }}
                  >
                    <button
                      className="mf-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setPlacement(kind);
                        setCursor(undefined);
                        closeMenu();
                      }}
                    >
                      <Icon name={kind === 'flowchart' ? 'flowchart' : 'sequence'} />
                      {title}
                    </button>
                  </DragPlacement>
                );
              })
            }
          </ToolbarMenu>
          <div className="mf-toolbar-slot" ref={setToolbar} />
          {!opened && (
            <ToolbarMenu label="Export" icon="export">
              {(closeMenu) => (
                <button
                  className="mf-menu-item"
                  role="menuitem"
                  onClick={() => {
                    exportFile();
                    closeMenu();
                  }}
                >
                  <Icon name="export" />
                  <span>
                    Workspace file <small>JSON</small>
                  </span>
                </button>
              )}
            </ToolbarMenu>
          )}
          {opened?.kind !== 'flowchart' && (
            <ToolbarMenu label="More actions" icon="more">
              {(closeMenu) => (
                <div onClick={closeMenu}>
                  <button className="mf-menu-item" role="menuitem" onClick={() => file.current?.click()}>
                    <Icon name="import" />
                    Import file
                  </button>
                  <button
                    className="mf-menu-item"
                    role="menuitem"
                    onClick={() => useDock.setState({ open: true, view: 'appearance' })}
                  >
                    <Icon name="shapes" />
                    Appearance
                  </button>
                  <button className="mf-menu-item" role="menuitem" onClick={openDocs}>
                    <Icon name="book" />
                    Docs
                  </button>
                  {workspaceActions}
                </div>
              )}
            </ToolbarMenu>
          )}
          <ProductNav current="canvas" showBrand={false} />
        </nav>
        <div className="mf-style-slot" ref={setStylePanel} />
        {placement && (
          <div className="diagram-placement-hint" role="status">
            Click the canvas to place the {placement}.{' '}
            <button
              onClick={() => {
                setPlacement(undefined);
                setCursor(undefined);
              }}
            >
              Cancel
            </button>
          </div>
        )}
        <input
          ref={file}
          hidden
          type="file"
          accept=".json"
          onChange={(e) => {
            const value = e.target.files?.[0];
            e.target.value = '';
            if (value)
              void importFile(value).then(
                () => {
                  drafts.clear();
                  setSequenceTarget(undefined);
                  setHistory([]);
                  setExpansion(new Map());
                  setSelection([]);
                  const fallback = defaultDiagram();
                  if (fallback) {
                    useDiagram.getState().openDiagram(fallback.id);
                    setExpansion(new Map([[fallback.id, true]]));
                  }
                  setPlacement(undefined);
                  setCursor(undefined);
                  setError('');
                },
                (reason) => setError(String(reason)),
              );
          }}
        />
        <ReactFlow<EntityNode>
          nodes={nodes}
          edges={[]}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 0.85 }}
          minZoom={0.05}
          maxZoom={2}
          deleteKeyCode={null}
          nodesConnectable={false}
          zoomOnDoubleClick={false}
          panOnDrag={[1, 2]}
          noPanClassName="workspace-nopan"
          elevateNodesOnSelect={false}
          selectionOnDrag={!placement}
          elementsSelectable={!placement}
          onPointerMove={(event) => {
            if (placement) setCursor(clientPoint({ x: event.clientX, y: event.clientY }));
          }}
          onPointerLeave={() => setCursor(undefined)}
          onNodeClick={(event, node) => {
            if (placement) add(placement, { x: event.clientX, y: event.clientY });
            else if (
              !event.shiftKey && !event.ctrlKey && !event.metaKey &&
              !(event.target instanceof Element && event.target.closest('input,button,.react-flow__resize-control'))
            ) {
              const hit = previewNodeAt(
                event.currentTarget.querySelector('.diagram-entity'), event.clientX, event.clientY,
              );
              open(node.id);
              const entity = entities.find((e) => e.id === node.id);
              if (hit?.id && entity?.kind === 'flowchart' && entity.nodes.some((n) => n.id === hit.id))
                useDiagram.getState().setSelection([hit.id], []);
              else if (hit?.target && entity?.kind === 'sequence') setSequenceTarget({ id: node.id, target: hit.target });
            }
          }}
          onPaneClick={(event) => {
            if (placement) add(placement, { x: event.clientX, y: event.clientY });
            else {
              setSelection([]);
              if (active) close();
            }
          }}
          onNodesChange={(changes) => {
            const selected = changes.filter((change) => change.type === 'select');
            if (selected.length && !placement)
              setSelection((current) => {
                const next = new Set(current);
                for (const change of selected) {
                  if (change.selected) next.add(change.id);
                  else next.delete(change.id);
                }
                return [...next];
              });
          }}
          onNodeDrag={(_, node, group) => {
            const { positions, guides } = snapDrag(group.length ? group : [node]);
            setDragPositions(positions);
            setMoveGuides(guides);
          }}
          onNodeDragStop={(_, node, group) => {
            const { positions } = snapDrag(group.length ? group : [node]);
            setMoveGuides([]);
            const next = entities.map((entity) => {
              const position = positions.get(entity.id);
              return position ? { ...entity, position } : entity;
            });
            setDragPositions(undefined);
            if (
              next.some(
                (entity, i) =>
                  entity.position.x !== entities[i].position.x || entity.position.y !== entities[i].position.y,
              )
            )
              save(next);
          }}
        >
          <Background
            gap={appearance.texture === 'grid' ? 24 : 18}
            variant={appearance.texture === 'grid' ? BackgroundVariant.Lines : BackgroundVariant.Dots}
          />
          <Controls showInteractive={false} className="workspace-nopan" />
          <MiniMap
            pannable
            zoomable
            className="workspace-nopan"
            style={{ width: 130, height: 90 }}
            nodeColor={(node) =>
              node.id === active ? 'color-mix(in srgb, var(--mf-accent) 45%, var(--mf-bg))' : 'var(--mf-border)'
            }
          />
          {opened && slots && (
            <ViewportPortal>
              <div
                className="diagram-editor"
                data-diagram-id={opened.id}
                onPointerDownCapture={(event) => {
                  // Working on a node or element inside the editor selects its diagram.
                  if (event.button === 0 && !placement)
                    setSelection((current) => (current.length === 1 && current[0] === opened.id ? current : [opened.id]));
                  // Keep pan gestures on the workspace when they start over an editor.
                  if (event.button !== 1 && event.button !== 2) return;
                  if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  pan.current = {
                    pointerId: event.pointerId,
                    client: { x: event.clientX, y: event.clientY },
                    view: getViewport(),
                  };
                }}
                onContextMenu={(event) => {
                  if (event.button === 2 && event.target instanceof Node && event.currentTarget.contains(event.target))
                    event.preventDefault();
                }}
                onPointerMove={(event) => {
                  const start = pan.current;
                  if (!start || start.pointerId !== event.pointerId) return;
                  void setViewport({
                    x: start.view.x + event.clientX - start.client.x,
                    y: start.view.y + event.clientY - start.client.y,
                    zoom: start.view.zoom,
                  });
                }}
                onLostPointerCapture={(event) => {
                  if (pan.current?.pointerId === event.pointerId) pan.current = null;
                }}
                style={{
                  left: dragPositions?.get(opened.id)?.x ?? opened.position.x,
                  top: (dragPositions?.get(opened.id)?.y ?? opened.position.y) + titleHeight,
                  width: opened.size.width * viewport.zoom,
                  height: (opened.size.height - titleHeight) * viewport.zoom,
                  transform: `scale(${1 / viewport.zoom})`,
                }}
              >
                <Suspense fallback={<p>Opening diagram…</p>}>
                  {opened.kind === 'sequence' ? (
                    <SequenceEditor
                      key={opened.id}
                      slots={{
                        ...slots,
                        source: sequenceSource,
                        outline: sequenceOutline,
                        target: sequenceTarget?.id === opened.id ? sequenceTarget.target : undefined,
                      }}
                    />
                  ) : (
                    <Editor key={opened.id} showWelcome={false} diagramKind="flowchart" slots={slots} />
                  )}
                </Suspense>
              </div>
            </ViewportPortal>
          )}
        </ReactFlow>
        <NodeTransforms
          nodes={diagramRects}
          selected={selection}
          preview={resizePreview}
          moveGuides={moveGuides}
          onPreview={setResizePreview}
          onCommit={commitResize}
          disabled={Boolean(placement || panning || dragPositions)}
          minSize={{ width: 400, height: 300 }}
        />
        {placement && cursor && (
          <div
            className="diagram-placement-preview"
            aria-hidden
            style={{
              left: cursor.x,
              top: cursor.y,
              width: 900 * viewport.zoom,
              height: 650 * viewport.zoom,
            }}
          />
        )}
        {error && (
          <p className="diagram-board-error" role="alert">
            {error}
            <button onClick={() => setError('')}>Dismiss</button>
          </p>
        )}
      </main>
      {panelOpen ? (
        <MermaidPanel
          width={panelWidth}
          onWidthChange={setPanelWidth}
          onClose={() => setPanelOpen(false)}
          showLinks={!!opened}
          tree={
            <WorkspaceTree
              entities={entities}
              active={active}
              open={openFromTree}
              rename={renameDiagram}
              expansion={expansion}
              setExpanded={(id, expanded) => setExpansion((prev) => new Map(prev).set(id, expanded))}
              sequenceOutline={setSequenceOutline}
              pickSequence={(id, target) => setSequenceTarget({ id, target })}
            />
          }
          source={
            opened?.kind === 'flowchart' ? (
              <FlowchartSource key={opened.id} diagramId={opened.id} drafts={drafts} />
            ) : opened?.kind === 'sequence' ? (
              <div className="mf-sequence-source" ref={setSequenceSource} />
            ) : (
              <p className="mf-tree-empty">Select a diagram to edit its Mermaid source.</p>
            )
          }
        />
      ) : (
        <button
          className="mf-reopen"
          aria-label="Open Mermaid panel"
          title="Mermaid · M"
          onClick={() => setPanelOpen(true)}
        >
          <Icon name="code" />
        </button>
      )}
    </div>
  );
}
export default function DiagramBoard({ Editor }: { Editor: FlowchartEditor }) {
  return (
    <ReactFlowProvider>
      <Board Editor={Editor} />
    </ReactFlowProvider>
  );
}
