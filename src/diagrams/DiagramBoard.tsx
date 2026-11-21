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
import { diagramEntities } from '../diagramEntities';
import type { DiagramEntity } from '../types';
import { toMermaid } from '../mermaid/io';
import { diagramSvg } from '../mermaid/svg';
import { activeAppearance, useAppearance } from '../theme';
import { exportFile, importFile } from '../persist';
import { useHash, parseRoute, openDocs } from '../route';
import ProductNav from '../components/ProductNav';
import { DragPlacement } from '../components/DragPlacement';
import { Icon } from '../components/Icon';
import { NodeTransforms, type ResizePreview } from '../components/NodeTransforms';
import './diagrams.css';

import { MermaidPanel, FlowchartSource } from '../components/MermaidPanel';
import { useDock } from '../dock';
import { useHotkeys } from '../useHotkeys';
import { settleFoldMotion } from '../foldMotion';
import { WorkspaceTree } from './WorkspaceTree';
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
  return (
    <article className={'diagram-entity' + (editing ? ' is-editing' : '')} aria-label={entity.title} data-diagram-id={entity.id}>
      <header className="diagram-title">
        <input
          className="nodrag workspace-nopan"
          aria-label="Diagram name"
          value={entity.title}
          onChange={(e) => data.rename(entity.id, e.target.value)}
        />
        {editing && <span className="diagram-editing-status" role="status">Editing</span>}
        <button
          className="nodrag workspace-nopan"
          onClick={() => (editing ? data.close() : data.open(entity.id))}
        >
          {editing ? 'Done' : 'Edit diagram'}
        </button>
      </header>
      {!editing && (
        <div className="diagram-preview">
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

type FlowchartEditor = ComponentType<{ showWelcome: boolean; diagramKind: 'flowchart'; slots: EditorSlots }>;

function Board({ Editor }: { Editor: FlowchartEditor }) {
  const state = useDiagram();
  const [error, setError] = useState('');
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
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
  const displayEntities = entities.map((entity) => {
    const rect = resizePreview?.rects.get(entity.id);
    return rect ? { ...entity, position: { x: rect.x, y: rect.y }, size: { width: rect.width, height: rect.height } } : entity;
  });
  const opened = displayEntities.find((entity) => entity.id === active);
  const diagramRects = useMemo(() => new Map(entities.map((entity) => [entity.id, { ...entity.position, ...entity.size }])), [entities]);
  const titleHeight = 40;
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
        : hash === '#/diagrams/sequence'
          ? entities.find((e) => e.kind === 'sequence')
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
  function reveal(id: string) {
    const entity = entities.find((e) => e.id === id);
    const area = board.current;
    if (!entity || !area) return;
    const x = viewport.x + entity.position.x * viewport.zoom;
    const y = viewport.y + entity.position.y * viewport.zoom;
    const right = x + entity.size.width * viewport.zoom;
    const bottom = y + entity.size.height * viewport.zoom;
    if (right <= 0 || bottom <= 0 || x >= area.clientWidth || y >= area.clientHeight)
      void setCenter(entity.position.x + entity.size.width / 2, entity.position.y + entity.size.height / 2, {
        zoom: viewport.zoom,
        duration: 180,
      });
  }
  function openFromTree(id: string) {
    open(id);
    reveal(id);
  }
  const revealActive = useEffectEvent(() => {
    if (active) reveal(active);
  });
  useEffect(() => {
    revealActive();
  }, [active]);
  function close() {
    settleFoldMotion();
    state.openDiagram(null);
    setSequenceTarget(undefined);
    if (parseRoute(location.hash).kind === 'node' || location.hash === '#/diagrams/sequence')
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
    if (!target || !board.current?.contains(target) || target.closest('.mf-toolbar,.react-flow__panel,dialog'))
      return;
    const position = screenToFlowPosition(client);
    const base = {
      id: crypto.randomUUID(),
      title: kind === 'flowchart' ? 'Flowchart' : 'Sequence',
      position,
      size: { width: 900, height: 650 },
    };
    const entity: DiagramEntity =
      kind === 'flowchart'
        ? { ...base, kind, nodes: [], edges: [] }
        : { ...base, kind, source: 'sequenceDiagram' };
    save([...entities, entity]);
    setPlacement(undefined);
    setCursor(undefined);
    setSelection([entity.id]);
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
  function remove() {
    if (!selection.length) return;
    if (active && selection.includes(active)) close();
    save(entities.filter((item) => !selection.includes(item.id)));
    setSelection([]);
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
      if (active || placement) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        remove();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && history.length) {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
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
      rename: (id, title) => save(entities.map((item) => (item.id === id ? { ...item, title } : item))),
    },
  }));
  function duplicate() {
    const copies = entities
      .filter((entity) => selection.includes(entity.id))
      .map((entity) => ({
        ...structuredClone(entity),
        id: crypto.randomUUID(),
        title: entity.title + ' copy',
        position: { x: entity.position.x + 40, y: entity.position.y + 40 },
      }));
    save([...entities, ...copies]);
    setSelection(copies.map((entity) => entity.id));
  }
  const workspaceActions = (
    <>
      <div className="mf-menu-sep" />
      <button role="menuitem" className="mf-menu-item" onClick={duplicate} disabled={!selection.length}>
        Duplicate selected diagrams
      </button>
      <button role="menuitem" className="mf-menu-item" onClick={remove} disabled={!selection.length}>
        Delete selected diagrams
      </button>
      <button role="menuitem" className="mf-menu-item" onClick={undo} disabled={!history.length}>
        Undo workspace change
      </button>
    </>
  );
  const slots = opened
    ? {
        diagramId: opened.id,
        toolbar,
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
          if (event.target.closest('input,textarea,select,button,[contenteditable="true"],.react-flow__resize-control')) return;
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
                      <Icon name={kind === 'flowchart' ? 'group' : 'arrow'} />
                      {title}
                    </button>
                  </DragPlacement>
                );
              })
            }
          </ToolbarMenu>
          <ProductNav current="canvas" iconOnly={compact} />
        </nav>
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
            ) open(node.id);
          }}
          onPaneClick={(event) => {
            if (placement) add(placement, { x: event.clientX, y: event.clientY });
            else {
              setSelection([]);
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
            setDragPositions(new Map((group.length ? group : [node]).map((item) => [item.id, item.position])));
          }}
          onNodeDragStop={(_, node, group) => {
            const positions = new Map((group.length ? group : [node]).map((item) => [item.id, item.position]));
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
                  // Keep pan gestures on the workspace when they start over an editor.
                  if (event.button !== 1 && event.button !== 2) return;
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
                  if (event.button === 2) event.preventDefault();
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
          moveGuides={[]}
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
          showLinks={opened?.kind === 'flowchart'}
          tree={
            <WorkspaceTree
              entities={entities}
              active={active}
              open={openFromTree}
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
