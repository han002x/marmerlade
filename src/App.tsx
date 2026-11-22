import { createPortal } from 'react-dom';
import type { EditorSlots } from './diagrams/editorSlots';
import DiagramBoard from './diagrams/DiagramBoard';
import { useEmbeddedFit, useWorkspaceZoom } from './diagrams/useWorkspaceZoom';
import { ToolButton } from './components/ToolButton';
import { ExportMenu, type ExportFormat } from './components/ExportMenu';
import { Activity, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ConnectionMode,
  MiniMap,
  NodeToolbar,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStoreApi,
  useStore,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { splitEdgeFor, useDiagram } from './store';
import { reuse } from './stable';
import { DiagramNode, NodeImg, type NodeData } from './components/DiagramNode';
import { GhostNode, type GhostData } from './components/GhostNode';
import { SheetNode, type SheetData } from './components/SheetNode';
import { NodeTransforms, type ResizePreview } from './components/NodeTransforms';
import { boundsOf, snapMove, type Guide } from './canvasTransform';
import {
  childrenOf,
  descendants,
  foldEdges,
  groupOrigin,
  groupPlan,
  ungroupTarget,
  isOpenGroup,
  nextFoldLevel,
  nextUnfoldLevel,
  sheets,
} from './fold';
import { setFoldSizes, useFoldMotion } from './foldMotion';
import { GHOST_SIZE, IMAGE_LABEL_SPACE, nodeSize, sizeFor } from './layout';
import { DiagramEdge } from './components/DiagramEdge';
import { JoinPreview } from './components/JoinPreview';
import { MermaidPanel } from './components/MermaidPanel';
import { StylePanel } from './components/StylePanel';
import ProductNav from './components/ProductNav';
import { Icon } from './components/Icon';
import { Welcome, WELCOME_EVENT, FIRST_RUN_FIT, isFirstRun } from './components/Welcome';
import { ShapePicker, type Placement } from './components/ShapePicker';
import { ImagePicker } from './components/ImagePicker';
import { CatalogIcon, ShapeOutline } from './components/ShapeOutline';
import { useTheme, activeAppearance } from './theme';
import { foldedAncestors, pageOf } from './pages.ts';
import { deckHref, openDocs, parseRoute, useHash } from './route';
import { showDeck, showPage, useDock } from './dock';
import { isTyping, useHotkeys } from './useHotkeys';
import { copyNodes, imagesFromClipboard, nodesFromClipboard, snapshotClipboard } from './clipboard';
import { importFile, saveForNavigation } from './persist';
import { cycleSeconds, exportGif, exportImage } from './gif';
import { FLOW_LEAD, flowCycle, flowSchedule, flowSeconds } from './flow';
import { clock, seek, usePlayer } from './flowPlayer';
import { FlowControls } from './components/FlowControls';
import type { DiagramNode as DNode, Side } from './types';
import { hasOutline, shapeDef } from './shapes';
import { installRenderBridge } from './renderBridge';
import './App.css';

const GHOST_ID = '__mf_ghost__';
const nodeTypes: NodeTypes = { diagram: DiagramNode, ghost: GhostNode, sheet: SheetNode };

const SHEET_PREFIX = '__sheet__';

/** Measured node sizes as one string, so the canvas re-renders only on change. */
const sizeKeySelector = (s: { nodeLookup: Map<string, { type?: string; width?: number; measured: { width?: number; height?: number } }> }) => {
  let key = '';
  for (const [id, n] of s.nodeLookup) {
    if (n.type === 'diagram' && n.width === undefined && n.measured.width) key += `${id}|${n.measured.width}|${n.measured.height}\n`;
  }
  return key;
};
const edgeTypes: EdgeTypes = { diagram: DiagramEdge };

/** half the rendered size of a freshly placed node (see `.mf-place-ghost`) */
function placeHalf({ shape, icon, image }: Placement): { x: number; y: number } {
  if (image) {
    const { width, height } = sizeFor(shape, undefined, image);
    return { x: width / 2, y: (height - IMAGE_LABEL_SPACE) / 2 + 8 };
  }
  if (icon) return shape === 'circle' ? { x: 45, y: 45 } : { x: 48, y: 42 };
  const side = shapeDef(shape).square;
  return side ? { x: side / 2, y: side / 2 } : { x: 60, y: 24 };
}

function openAppearancePanel() {
  useDock.setState({ open: true, view: 'appearance' });
  requestAnimationFrame(() => document.getElementById('mf-tab-appearance')?.focus());
}

function Canvas({ onTogglePanel, exporting, setExporting, welcome, slots }: {
  slots?: EditorSlots;
  onTogglePanel: () => void;
  exporting: ExportFormat | null;
  setExporting: (format: ExportFormat | null) => void;
  welcome: boolean;
}) {
  const nodes = useDiagram((s) => s.nodes);
  const edges = useDiagram((s) => s.edges);
  const addNode = useDiagram((s) => s.addNode);
  const moveNode = useDiagram((s) => s.moveNode);
  const removeNode = useDiagram((s) => s.removeNode);
  const removeEdge = useDiagram((s) => s.removeEdge);
  const connect = useDiagram((s) => s.connect);
  const isGroup = useDiagram((s) => s.isGroup);
  const hiddenNodeIds = useDiagram((s) => s.hiddenNodeIds);
  const insertion = useDiagram((s) => s.insertion);
  const autoLayout = useDiagram((s) => s.autoLayout);
  const undo = useDiagram((s) => s.undo);
  const { fitView, screenToFlowPosition, getZoom, setViewport } = useReactFlow();
  useWorkspaceZoom(slots?.workspaceZoom);
  useEmbeddedFit(slots ? { maxZoom: slots.workspaceZoom, padding: 0.18 } : undefined);
  const embedded = Boolean(slots);
  const canvasRef = useRef<HTMLDivElement>(null);
  const flowStore = useStoreApi();
  const selectionRect = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const selectingBox = useRef(false);
  useEffect(() => flowStore.subscribe((state) => {
    if (state.userSelectionRect) selectionRect.current = state.userSelectionRect;
  }), [flowStore]);
  // Keep the canvas centered on the same point as the dock opens, resizes, or closes.
  useEffect(() => {
    if (embedded) return;
    return flowStore.subscribe((state, previous) => {
      if (state.width === previous.width && state.height === previous.height) return;
      if (!previous.width || !previous.height || !state.width || !state.height) return;
      const [x, y, zoom] = state.transform;
      void setViewport({
        x: x + (state.width - previous.width) / 2,
        y: y + (state.height - previous.height) / 2,
        zoom,
      });
    });
  }, [flowStore, setViewport, embedded]);
  useEffect(() => installRenderBridge(async () => {
    await document.fonts.ready;
    if (!useDiagram.getState().nodes.length) return;
    let previous = '';
    let stable = 0;
    for (let frame = 0; frame < 120 && stable < 3; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const current = Array.from(document.querySelectorAll('.react-flow__node'), node => {
        const rect = node.getBoundingClientRect();
        return `${rect.x},${rect.y},${rect.width},${rect.height}`;
      }).join('|');
      stable = current === previous ? stable + 1 : 0;
      previous = current;
    }
    await fitView({ padding: 0.25, duration: 0 });
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }), [fitView]);
  const load = useDiagram((s) => s.load);
  const theme = useTheme();
  const selected = useDiagram((s) => s.selectedNodeIds);
  const selectedEdges = useDiagram((s) => s.selectedEdgeIds);
  const single = selected.length === 1 && !selectedEdges.length ? nodes.find((n) => n.id === selected[0]) : undefined;
  const explanation = useDiagram((s) => pageOf(single, s.pages));
  const linkedDeck = useDiagram((s) => pageOf(single, s.decks, 'deckIds'));
  const setSelection = useDiagram((s) => s.setSelection);
  const groupNodes = useDiagram((s) => s.groupNodes);
  const ungroupNodes = useDiagram((s) => s.ungroupNodes);
  const fileInput = useRef<HTMLInputElement>(null);

  // a new user's demo diagram is framed below the first-run notes
  useEffect(() => {
    if (!welcome) return;
    const t = window.setTimeout(() => fitView(FIRST_RUN_FIT), 80);
    return () => window.clearTimeout(t);
  }, [welcome, fitView]);

  /** shape awaiting placement, and the live cursor position for its preview */
  const [pending, setPending] = useState<Placement | null>(null);
  /** the shape + icon library popover */
  const [pickerOpen, setPickerOpen] = useState(false);
  /** the image (URL / upload / clipboard) popover */
  const [imageOpen, setImageOpen] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  /** last pointer position over the canvas: where pasted nodes land */
  const pointer = useRef<{ x: number; y: number } | null>(null);
  /** a short-lived message, e.g. why a paste was refused */
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const flash = useCallback((msg: string) => {
    window.clearTimeout(noticeTimer.current);
    setNotice(msg);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3500);
  }, []);

  /** the overflow (3-dot) menu: open state and its anchor for click-outside */
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const canvasWidth = useStore((state) => state.width);
  const canvasHeight = useStore((state) => state.height);
  const compactToolbar = canvasWidth < 600;

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof globalThis.Node && !menuRef.current?.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        menuRef.current?.querySelector('button')?.focus();
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const onPickFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // allow re-importing the same file
      if (!file) return;
      try {
        await importFile(file);
        window.requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }));
      } catch {
        // ignore malformed files; a real validation UI can come later
      }
    },
    [fitView],
  );

  const clearCanvas = useCallback(() => {
    const state = useDiagram.getState();
    if(state.activeDiagramId)state.loadMermaid('flowchart TD');
    else load({ ...state, nodes: [], edges: [] });
    useDiagram.setState({ sequenceHistory: state.sequenceHistory });
    saveForNavigation();
    useDock.getState().setOpen(false);
    window.dispatchEvent(new Event(WELCOME_EVENT));
  }, [load]);

  const tidy = useCallback(
    (direction: 'TB' | 'LR') => {
      autoLayout(direction);
      // let positions commit, then frame the result
      window.requestAnimationFrame(() =>
        fitView({ padding: 0.2, duration: 300 }),
      );
    },
    [autoLayout, fitView],
  );

  // Export an animated GIF of the whole diagram: frame it, drop the live
  // selection so no outline bleeds into the capture, then record the viewport.
  const saveExport = useCallback(async (format: ExportFormat, exportWidth: number) => {
    if (exporting) return;
    const el = canvasRef.current;
    if (!el) return;
    setExporting(format);
    setSelection([], []);
    fitView({ padding: 0.2, duration: 0 });
    // wait a frame for the fit + deselect to paint before capturing
    await new Promise((r) => window.requestAnimationFrame(() => r(null)));
    try {
      if (format === 'png') {
        await exportImage(el, exportWidth);
        return;
      }
      const { nodes: ns, edges: es } = useDiagram.getState();
      // a sequence that is playing or stepped into is recorded as one loop,
      // each frame taken at a fixed clock reading
      const { steps, speed, playing: wasPlaying, lit: wasLit } = usePlayer.getState();
      const recordFlow = steps > 0 && (wasPlaying || wasLit);
      const was = clock();
      if (recordFlow) usePlayer.getState().pause();
      const loop = recordFlow ? flowSeconds(steps, speed) : 0;
      try {
        await exportGif(
          el,
          {
            mode: 'realtime',
            seconds: cycleSeconds({ nodes: ns, edges: es }, loop),
            frame: recordFlow ? (t) => seek(-FLOW_LEAD + (((t / loop) % 1) * flowCycle(steps))) : undefined,
          },
          { maxWidth: exportWidth, upscale: true },
        );
      } finally {
        if (recordFlow) {
          seek(was);
          if (wasPlaying) usePlayer.getState().toggle();
        }
      }
    } catch (error) {
      flash(`Couldn't export ${format.toUpperCase()}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setExporting(null);
    }
  }, [exporting, fitView, setSelection, flash, setExporting]);

  const hidden = useMemo(() => hiddenNodeIds(), [hiddenNodeIds, nodes]);
  // not drawn as a node: folded away, or an unfolded group (just a sheet)
  const offscreen = useMemo(() => {
    const kids = childrenOf(nodes);
    const out = new Set(hidden);
    for (const n of nodes) if (isOpenGroup(n, kids)) out.add(n.id);
    return out;
  }, [nodes, hidden]);

  // the edges on screen: those into a folded card crease onto the card instead
  // of vanishing, and ones on an unfolded group land on its sheet, as in Mermaid
  const shown = useMemo(() => {
    const { direct, folded } = foldEdges(nodes, edges, hidden);
    // One between a group and its own contents has no sensible path, so it
    // waits until the group folds (and then folds away inside it).
    const kids = childrenOf(nodes);
    const inside = new Map<string, Set<string>>();
    const within = (g: string, id: string) => {
      if (!inside.has(g)) inside.set(g, new Set(descendants(g, kids)));
      return inside.get(g)!.has(id);
    };
    const endOf = (id: string) => (offscreen.has(id) ? SHEET_PREFIX + id : id);
    const placed = direct.flatMap((e) => {
      const s = offscreen.has(e.source);
      const t = offscreen.has(e.target);
      if ((s && within(e.source, e.target)) || (t && within(e.target, e.source))) return [];
      return [{ ...e, source: endOf(e.source), target: endOf(e.target) }];
    });
    return { direct, placed, folded, endOf };
  }, [nodes, edges, hidden, offscreen]);

  // the order the sequenced flow travels them
  const flow = useMemo(
    () => flowSchedule([...shown.placed, ...shown.folded]),
    [shown],
  );
  // fold choreography: nodes mid-fold are drawn on the card they fold into
  const foldPhase = useFoldMotion((s) => s.phase);
  const foldAnchor = useFoldMotion((s) => s.anchor);
  const fold = useFoldMotion((s) => s.fold);
  const unfold = useFoldMotion((s) => s.unfold);
  const [resizePreview, setResizePreview] = useState<ResizePreview | null>(null);
  const commitResize = useCallback((rects: ResizePreview['rects']) => useDiagram.getState().resizeNodes(nodes, rects), [nodes]);
  const [moveGuides, setMoveGuides] = useState<Guide[] | null>(null);
  const draggingNodes = useRef(false);

  // Measured node sizes, kept across renders. The canvas is controlled, so
  // React Flow only remembers a size if we hand it back on the node; without
  // this, rebuilding nodes would drop sizes and the sheets would never settle.
  const sizeCache = useRef(new Map<string, { width: number; height: number }>());
  const sizeKey = useStore(sizeKeySelector);
  const sizesVersion = useMemo(() => {
    for (const line of sizeKey.split('\n')) {
      const [id, w, h] = line.split('|');
      if (id) sizeCache.current.set(id, { width: Number(w), height: Number(h) });
    }
    let v = '';
    for (const [id, z] of sizeCache.current) v += `${id}|${z.width}|${z.height}\n`;
    return v;
  }, [sizeKey]);
  const sizeOf = useMemo(() => {
    const measured = new Map(sizeCache.current);
    return (n: DNode) => n.size ?? measured.get(n.id) ?? nodeSize(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizesVersion]);
  useEffect(() => setFoldSizes(sizeOf), [sizeOf]);

  const positionOf = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const kids = childrenOf(nodes);
    // a group's card (shown once folded) sits at the top-left of its contents
    const groupPos = new Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      const o = kids.has(n.id) ? groupOrigin(n.id, nodes, kids) : null;
      if (o) groupPos.set(n.id, o);
    }
    const base = (n: DNode) => groupPos.get(n.id) ?? n.position;
    return (n: DNode) => {
      const into = foldPhase && foldPhase !== 'unfolding' ? foldAnchor.get(n.id) : undefined;
      const card = into ? byId.get(into) : undefined;
      if (!card) return base(n);
      // center the node on the card it is tucked under
      const a = sizeOf(card);
      const b = sizeOf(n);
      const at = base(card);
      return {
        x: at.x + (a.width - b.width) / 2,
        y: at.y + (a.height - b.height) / 2,
      };
    };
  }, [nodes, foldPhase, foldAnchor, sizeOf]);

  const nodeRects = useMemo(() => new Map(nodes.filter((n) => !offscreen.has(n.id))
    .map((n) => [n.id, { ...positionOf(n), ...sizeOf(n) }])), [nodes, offscreen, positionOf, sizeOf]);
  const previewRects = resizePreview?.rects;

  const nodeCache = useRef(new Map<string, Node<NodeData>>());
  const sheetCache = useRef(new Map<string, Node<SheetData>>());
  const edgeCache = useRef(new Map<string, Edge>());
  const rfNodes: Node<NodeData>[] = useMemo(() => {
    const motionClass =
      foldPhase === 'folding' ? 'mf-folding' : foldPhase === 'unfold-start' ? 'mf-unfold-start' : 'mf-unfolding';
    const cards = new Set(foldAnchor.values());
    // selection is owned by the store: passing it down keeps React Flow in step
    // when code selects a node (e.g. one just inserted), so a pane click still
    // deselects it
    const sel = new Set(selected);
    const list = nodes.filter((n) => !offscreen.has(n.id)).map((n) => {
      const preview = previewRects?.get(n.id);
      const size = preview ? { width: preview.width, height: preview.height } : n.size;
      return {
        id: n.id,
        selected: sel.has(n.id),
        type: 'diagram',
        position: preview ? { x: preview.x, y: preview.y } : positionOf(n),
        ...size,
        measured: size ?? sizeCache.current.get(n.id),
        className: foldAnchor.has(n.id)
          ? motionClass
          : foldPhase && cards.has(n.id)
            ? 'mf-fold-card'
            : undefined,
        data: {
          label: n.label,
          shape: n.shape,
          icon: n.icon,
          image: n.image,
          isGroup: isGroup(n.id),
          collapsed: n.collapsed,
          style: n.style,
          sized: !!size,
          flowAt: flow.nodeAt.get(n.id),
        },
      };
    });
    return reuse(nodeCache.current, list);
  }, [nodes, offscreen, isGroup, positionOf, foldPhase, foldAnchor, selected, flow, previewRects]);

  // a sheet of paper behind every unfolded group, under edges and nodes
  const sheetNodes: Node<SheetData>[] = useMemo(() => {
    const moving = new Set([...foldAnchor.keys(), ...foldAnchor.values()]);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const list = sheets(nodes, hidden, (n) => previewRects?.get(n.id) ?? positionOf(n),
      (n) => previewRects?.get(n.id) ?? sizeOf(n)).map((sh) => ({
      id: SHEET_PREFIX + sh.groupId,
      type: 'sheet',
      position: { x: sh.rect.x, y: sh.rect.y },
      width: sh.rect.width,
      height: sh.rect.height,
      // without `measured`, React Flow drops the sheet's handle bounds on every
      // rebuild, and a node without them counts as inside any selection box
      measured: { width: sh.rect.width, height: sh.rect.height },
      zIndex: sh.depth - nodes.length - 1,
      draggable: true,
      selected: selected.includes(sh.groupId),
      selectable: true,
      focusable: false,
      deletable: false,
      className: foldPhase && moving.has(sh.groupId) ? `mf-sheet-${foldPhase}` : undefined,
      data: {
        groupId: sh.groupId,
        width: sh.rect.width,
        height: sh.rect.height,
        depth: sh.depth,
        // a group has no card while unfolded, so its sheet carries the title
        title: byId.get(sh.groupId)?.label ?? '',
      },
    }));
    return reuse(sheetCache.current, list);
  }, [nodes, hidden, positionOf, sizeOf, foldPhase, foldAnchor, previewRects, selected]);

  // folding a group hides its subtree: drop it from the selection so a later
  // delete never removes something the user can no longer see
  useEffect(() => {
    const { selectedNodeIds, selectedEdgeIds } = useDiagram.getState();
    const kept = selectedNodeIds.filter((id) => !hidden.has(id));
    if (kept.length !== selectedNodeIds.length) setSelection(kept, selectedEdgeIds);
  }, [hidden, setSelection]);

  // A non-interactive ghost node mirrors the Mermaid editor's insertion gap.
  // It sits midway between the nodes declared just above and just below the
  // gap; at either end of the document it sits beyond the single neighbour.
  // It is then nudged off any visible node so it never hides one.
  const ghostNode: Node<GhostData> | null = useMemo(() => {
    if (!insertion) return null;
    const visible = nodes.filter((n) => !offscreen.has(n.id));
    const find = (id: string | null) => (id == null ? undefined : visible.find((n) => n.id === id));
    const prev = find(insertion.afterNodeId);
    const next = find(insertion.beforeNodeId);

    const g = GHOST_SIZE;
    const GAP = 40;
    const rect = (n: DNode) => ({ ...positionOf(n), ...sizeOf(n) });
    const center = (n: DNode) => {
      const r = rect(n);
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };

    let c: { x: number; y: number };
    if (prev && next) {
      const a = center(prev);
      const b = center(next);
      c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    } else if (prev) {
      const r = rect(prev);
      c = { x: r.x + r.width / 2, y: r.y + r.height + GAP + g.height / 2 };
    } else if (next) {
      const r = rect(next);
      c = { x: r.x + r.width / 2, y: r.y - GAP - g.height / 2 };
    } else {
      c = { x: 40 + g.width / 2, y: 40 + g.height / 2 };
    }
    let pos = { x: c.x - g.width / 2, y: c.y - g.height / 2 };

    // step downward until the ghost clears every visible node (sheets are
    // separate nodes, so the ghost may still sit on a group's sheet)
    const solid = visible.map(rect);
    const PAD = 12;
    const hits = (p: { x: number; y: number }) =>
      solid.some(
        (r) =>
          p.x < r.x + r.width + PAD &&
          p.x + g.width + PAD > r.x &&
          p.y < r.y + r.height + PAD &&
          p.y + g.height + PAD > r.y,
      );
    for (let i = 0; i < 24 && hits(pos); i++) pos = { x: pos.x, y: pos.y + g.height / 2 };

    return {
      id: GHOST_ID,
      type: 'ghost',
      position: pos,
      // paint above nodes and edge labels so the preview is never covered
      zIndex: 1000,
      draggable: false,
      selectable: false,
      focusable: false,
      deletable: false,
      data: { shape: 'rect' },
    };
  }, [insertion, nodes, offscreen, positionOf, sizeOf]);

  // share where the ghost is drawn so clicking the editor gap commits a node
  // at exactly the previewed spot
  const setGhostAt = useDiagram((s) => s.setGhostAt);
  useEffect(() => setGhostAt(ghostNode ? ghostNode.position : null), [ghostNode, setGhostAt]);

  const rfNodesWithGhost = useMemo(
    () => [
      ...(sheetNodes as Node[]),
      ...(rfNodes as Node[]),
      ...(ghostNode ? [ghostNode as Node] : []),
    ],
    [sheetNodes, rfNodes, ghostNode],
  );

  const rfEdges: Edge[] = useMemo(() => {
    const selEdge = new Set(selectedEdges);
    const { direct, placed, folded, endOf } = shown;
    // while previewing an insertion that splits A → B, draw A → ghost → B as
    // dashed preview legs in place of the edge it would replace
    const split = ghostNode ? splitEdgeFor(edges, insertion) : undefined;
    const splitting = split && direct.some((e) => e.id === split.id) ? split : undefined;
    const previewLegs: Edge[] = splitting
      ? [
          { source: splitting.source, target: GHOST_ID },
          { source: GHOST_ID, target: splitting.target },
        ].map((leg, i) => ({
          id: `__mf_ghost_edge_${i}__`,
          type: 'diagram',
          source: endOf(leg.source),
          target: endOf(leg.target),
          sourceHandle: 'bottom',
          targetHandle: 'top',
          className: 'mf-ghost-edge',
          selectable: false,
          focusable: false,
          deletable: false,
          data: { style: splitting.style, preview: true },
        }))
      : [];
    return reuse(edgeCache.current, [
      ...previewLegs,
      // the split edge stays mounted (faded) so its label and insert button
      // keep the pointer, otherwise the preview would end the hover it came from
      ...placed.map((e) => ({
        id: e.id,
        className: e.id === splitting?.id ? 'mf-edge-splitting' : undefined,
        type: 'diagram',
        selected: selEdge.has(e.id),
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceSide ?? 'bottom',
        targetHandle: e.targetSide ?? 'top',
        label: e.label,
        animated: false,
        data: { style: e.style, flowStep: flow.edgeStep.get(e.id) },
      })),
      ...folded.map((f) => ({
        id: f.id,
        type: 'diagram',
        source: f.source,
        target: f.target,
        sourceHandle: 'bottom',
        targetHandle: 'top',
        label: f.label,
        selectable: false,
        focusable: false,
        deletable: false,
        data: { folded: true, count: f.count, style: f.style, flowStep: flow.edgeStep.get(f.id) },
      })),
    ]);
  }, [shown, flow, edges, ghostNode, insertion, selectedEdges]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      let nextSel: string[] | null = null;
      const dragging = changes.some((c) => c.type === 'position' && c.dragging && nodeRects.has(c.id));
      let snap: ReturnType<typeof snapMove> | undefined;
      if (!foldPhase && (dragging || draggingNodes.current)) {
        const positions = new Map(changes.flatMap((c) => c.type === 'position' && c.position ? [[c.id, c.position]] : []));
        const moving = [];
        const others = [];
        for (const [id, rect] of nodeRects) {
          const position = positions.get(id);
          if (position) moving.push({ ...rect, ...position });
          else others.push(rect);
        }
        const bounds = boundsOf(moving);
        if (bounds) {
          snap = snapMove(bounds, others, getZoom());
          draggingNodes.current = dragging;
          setMoveGuides(dragging ? snap.guides : null);
        }
      }
      for (const c of changes) {
        if ('id' in c && c.id === GHOST_ID) continue;
        if ('id' in c && c.id.startsWith(SHEET_PREFIX)) {
          if (c.type === 'position' && c.position) {
            const sheet = sheetNodes.find((n) => n.id === c.id);
            const current = useDiagram.getState().nodes;
            const groupId = c.id.slice(SHEET_PREFIX.length);
            const origin = groupOrigin(groupId, current, childrenOf(current));
            if (sheet && origin) {
              moveNode(groupId, {
                x: origin.x + c.position.x - sheet.position.x,
                y: origin.y + c.position.y - sheet.position.y,
              });
            }
          } else if (c.type === 'select') {
            const groupId = c.id.slice(SHEET_PREFIX.length);
            const base: string[] = nextSel ?? useDiagram.getState().selectedNodeIds;
            nextSel = c.selected
              ? [...new Set([...base, groupId])]
              : base.filter((id) => id !== groupId);
          }
          continue;
        }
        if (c.type === 'position' && c.position) {
          const offset = nodeRects.has(c.id) ? snap?.offset : undefined;
          moveNode(c.id, offset ? { x: c.position.x + offset.x, y: c.position.y + offset.y } : c.position);
        } else if (c.type === 'select') {
          const base: string[] = nextSel ?? useDiagram.getState().selectedNodeIds;
          nextSel = c.selected
            ? [...new Set([...base, c.id])]
            : base.filter((id: string) => id !== c.id);
        }
      }
      if (nextSel) {
        setSelection(nextSel, useDiagram.getState().selectedEdgeIds);
      }
    },
    [moveNode, setSelection, sheetNodes, nodeRects, foldPhase, getZoom],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      let nextSel: string[] | null = null;
      for (const c of changes) {
        if (c.type === 'select') {
          if (selectingBox.current) continue;
          const base: string[] = nextSel ?? useDiagram.getState().selectedEdgeIds;
          nextSel = c.selected
            ? [...new Set([...base, c.id])]
            : base.filter((id: string) => id !== c.id);
        }
      }
      if (nextSel) {
        setSelection(useDiagram.getState().selectedNodeIds, nextSel);
      }
    },
    [setSelection],
  );

  const asSide = (h?: string | null): Side | undefined =>
    h === 'top' || h === 'right' || h === 'bottom' || h === 'left' ? h : undefined;
  const dragFrom = useRef<string | null>(null);

  const onConnect = useCallback(
    (c: Connection) => {
      const real = (id: string) => (id.startsWith(SHEET_PREFIX) ? id.slice(SHEET_PREFIX.length) : id);
      if (!c.source || !c.target) return;
      // Direction follows the drag, whichever side of the node it started from.
      const from = dragFrom.current;
      const flip = from === c.target && from !== c.source;
      const [a, b] = flip ? [c.target, c.source] : [c.source, c.target];
      const [sa, sb] = flip ? [c.targetHandle, c.sourceHandle] : [c.sourceHandle, c.targetHandle];
      connect(real(a), real(b), asSide(sa), asSide(sb));
    },
    [connect],
  );

  const [connecting, setConnecting] = useState(false);

  // Arm a shape for placement: the next left-click on the canvas drops it at
  // the cursor. A preview ghost follows the pointer until then.
  const arm = useCallback((p: Placement) => {
    setPending(p.image ? { shape: p.shape, image: p.image } : p.icon ? { shape: p.shape, icon: p.icon } : { shape: p.shape });
    setCursor(null);
  }, []);

  const cancelPending = useCallback(() => {
    setPending(null);
    setCursor(null);
  }, []);

  const onPaneMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const bounds = canvasRef.current?.getBoundingClientRect();
      if (!pending || !bounds) return;
      setCursor({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
    },
    [pending],
  );

  // Place the armed shape at the clicked point (centered on the cursor).
  const onPaneClick = useCallback(
    (e: React.MouseEvent) => {
      if (!pending) return;
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const half = placeHalf(pending);
      addNode(pending.shape, { x: flow.x - half.x, y: flow.y - half.y }, pending);
      cancelPending();
    },
    [pending, screenToFlowPosition, addNode, cancelPending],
  );

  const deleteSelected = useCallback(() => {
    selected.forEach((id) => removeNode(id));
    selectedEdges.forEach((id) => removeEdge(id));
    setSelection([], []);
  }, [selected, selectedEdges, removeNode, removeEdge, setSelection]);

  // F: fold the selected groups (or the sheet a selected node sits on);
  // unfold them instead when they are all already folded
  const foldSelection = useCallback(() => {
    const { nodes: all, selectedNodeIds } = useDiagram.getState();
    const kids = childrenOf(all);
    const byId = new Map(all.map((n) => [n.id, n]));
    const targets = new Set<string>();
    for (const id of selectedNodeIds) {
      const n = byId.get(id);
      if (!n) continue;
      if (kids.has(id)) targets.add(id);
      else if (n.parentId) targets.add(n.parentId);
    }
    const ids = [...targets];
    if (ids.length === 0) return;
    if (ids.every((id) => byId.get(id)?.collapsed)) unfold(ids);
    else fold(ids.filter((id) => !byId.get(id)?.collapsed));
  }, [fold, unfold]);

  const groupAction = useMemo(() => ungroupTarget(nodes, selected) ? 'ungroup' : groupPlan(nodes, selected)?.kind ?? null, [nodes, selected]);

  const groupSelection = useCallback(() => {
    const { nodes: all, selectedNodeIds } = useDiagram.getState();
    if (ungroupTarget(all, selectedNodeIds)) ungroupNodes(selectedNodeIds);
    else groupNodes(selectedNodeIds);
  }, [groupNodes, ungroupNodes]);

  // [ / ]: fold or unfold the whole diagram one crease at a time, then frame it
  const foldLevel = useCallback(
    (dir: 'fold' | 'unfold') => {
      const all = useDiagram.getState().nodes;
      const ids = dir === 'fold' ? nextFoldLevel(all) : nextUnfoldLevel(all);
      if (ids.length === 0) return;
      if (dir === 'fold') fold(ids);
      else unfold(ids);
      window.setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 280);
    },
    [fold, unfold, fitView],
  );

  // W: drill down into the selected node's page
  const openSelectedPage = useCallback(() => {
    const id = useDiagram.getState().selectedNodeIds[0];
    if (id) showPage(id);
  }, []);

  // K: the Slides tab, on the selected node's deck (or every deck when nothing is selected)
  const openSelectedDeck = useCallback(() => {
    const id = useDiagram.getState().selectedNodeIds[0];
    if (id) showDeck(id);
    else useDock.setState({ open: true, view: 'slides' });
  }, []);

  // E: flip the page tab between Markdown and Preview
  const toggleMode = useCallback(() => {
    const { view, mode, setMode } = useDock.getState();
    if (view === 'page') setMode(mode === 'read' ? 'edit' : 'read');
  }, []);

  // #/node/<id> (from the wiki): unfold what hides the node, select it, frame it
  useEffect(() => {
    let frameTimer: number;
    const goto = () => {
      const route = parseRoute(window.location.hash);
      if (route.kind !== 'node') return;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      const { nodes: all } = useDiagram.getState();
      const node = all.find((n) => n.id === route.id);
      if (!node) return;
      const closed = foldedAncestors(all, node.id);
      if (closed.length) unfold(closed);
      setSelection([node.id], []);
      const sheet = !node.collapsed && all.some((n) => n.parentId === node.id);
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.clearTimeout(frameTimer);
      frameTimer = window.setTimeout(
        () =>
          fitView({
            nodes: [{ id: sheet ? `${SHEET_PREFIX}${node.id}` : node.id }],
            padding: 0.6,
            maxZoom: 1.2,
            duration: calm ? 0 : 400,
          }),
        closed.length ? 320 : 60,
      );
    };
    const first = window.setTimeout(goto, 0);
    window.addEventListener('hashchange', goto);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(frameTimer);
      window.removeEventListener('hashchange', goto);
    };
  }, [unfold, setSelection, fitView]);

  useHotkeys(
    useMemo(
      () => [
        { key: 'v', run: cancelPending },
        { key: 'r', run: () => arm({ shape: 'rect' }) },
        { key: 'o', run: () => arm({ shape: 'round' }) },
        { key: 'd', run: () => arm({ shape: 'diamond' }) },
        { key: 'c', run: () => arm({ shape: 'circle' }) },
        { key: 's', run: () => (setImageOpen(false), setPickerOpen((v) => !v)) },
        { key: 'i', run: () => (setPickerOpen(false), setImageOpen((v) => !v)) },
        { key: 'l', run: () => tidy('TB') },
        { key: 'l', shift: true, run: () => tidy('LR') },
        { key: 't', run: openAppearancePanel },
        { key: 'f', run: foldSelection },
        { key: 'w', run: openSelectedPage },
        { key: 'k', run: openSelectedDeck },
        { key: 'e', run: toggleMode },
        { key: '[', run: () => foldLevel('fold') },
        { key: ']', run: () => foldLevel('unfold') },
        { key: 'm', run: onTogglePanel },
        { key: 'z', meta: true, run: undo },
        { key: 'g', meta: true, run: groupSelection },
        { key: 'g', run: groupSelection },
        { key: 'escape', run: cancelPending },
        { key: 'backspace', run: deleteSelected },
        { key: 'delete', run: deleteSelected },
      ],
      [arm, tidy, onTogglePanel, deleteSelected, undo, cancelPending, foldSelection, foldLevel, groupSelection, openSelectedPage, openSelectedDeck, toggleMode],
    ),
  );

  // Use native clipboard events so text fields and external images keep working.
  useEffect(() => {
    const isEditing = (e: ClipboardEvent) =>
      e.defaultPrevented || isTyping(e.target) || isTyping(document.activeElement) || document.querySelector('dialog[open]') !== null;
    const onCopy = (e: ClipboardEvent) => {
      if (isEditing(e) || window.getSelection()?.toString()) return;
      const diagram = useDiagram.getState();
      copyNodes(e, diagram, diagram.selectedNodeIds);
    };
    let lastPaste: { x: number; y: number; n: number } | null = null;
    const onPaste = async (e: ClipboardEvent) => {
      if (isEditing(e) || !e.clipboardData) return;
      const readNodes = nodesFromClipboard(e.clipboardData.getData('text/html'));
      const clip = snapshotClipboard(e.clipboardData);
      if (!readNodes && !clip) return;
      e.preventDefault();
      // at the pointer when it is over the canvas, else the middle of the view
      const pane = canvasRef.current?.getBoundingClientRect();
      const p = pointer.current;
      const inside = p && pane && p.x >= pane.left && p.x <= pane.right && p.y >= pane.top && p.y <= pane.bottom;
      const screen = inside ? p : pane ? { x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 } : { x: 0, y: 0 };
      const at = screenToFlowPosition(screen);
      // pasting again at the same spot cascades instead of stacking exactly
      const n = lastPaste && Math.hypot(lastPaste.x - at.x, lastPaste.y - at.y) < 1 ? lastPaste.n + 1 : 0;
      lastPaste = { ...at, n };
      const fragment = readNodes && await readNodes.catch(() => null);
      if (fragment) {
        const offset = (n + 1) * 24;
        useDiagram.getState().pasteNodes(fragment, { x: at.x + offset, y: at.y + offset });
        return;
      }
      if (!clip) return;
      imagesFromClipboard(clip)
        .then((items) => {
          if (items.length === 0) return;
          const ids = items.map(({ image, label }, i) => {
            const half = placeHalf({ shape: 'rect', image });
            const off = (n + i) * 24;
            return addNode('rect', { x: at.x - half.x + off, y: at.y - half.y + off }, { image, label });
          });
          setSelection(ids, []);
        })
        .catch((err: Error) => flash(`Couldn't paste the image: ${err.message}`));
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, [addNode, screenToFlowPosition, setSelection, flash]);

  const toolbar=(
    <>
        <div className="mf-group-btns">
          <ToolButton label="Rectangle" hotkey="R" onClick={() => arm({ shape: 'rect' })}>
            <Icon name="rect" />
          </ToolButton>
          <ToolButton label="Rounded" hotkey="O" onClick={() => arm({ shape: 'round' })}>
            <Icon name="round" />
          </ToolButton>
          <ToolButton label="Diamond" hotkey="D" onClick={() => arm({ shape: 'diamond' })}>
            <Icon name="diamond" />
          </ToolButton>
          <ToolButton label="Circle" hotkey="C" onClick={() => arm({ shape: 'circle' })}>
            <Icon name="circle" />
          </ToolButton>
          <ShapePicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={arm} />
          <ImagePicker open={imageOpen} onOpenChange={setImageOpen} onPick={arm} />
        </div>
        <span className="mf-sep" />
        <div className="mf-group-btns">
          <FlowControls sig={flow.sig} steps={flow.steps} />
        </div>
        <span className="mf-sep" />
        <ExportMenu size={{ width: canvasWidth, height: canvasHeight }} exporting={exporting} onExport={saveExport} />
        <div className="mf-menu-wrap" ref={menuRef}>
          <ToolButton label="More actions" expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            <Icon name="more" />
          </ToolButton>
          {menuOpen && (
            <div className="mf-menu" role="menu">
              <button
                className="mf-menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  if(slots)slots.onImport();
                  else fileInput.current?.click();
                }}
              >
                <Icon name="import" />
                <span>Import file</span>
              </button>
              <button
                className="mf-menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  menuRef.current?.querySelector('button')?.focus();
                  openAppearancePanel();
                }}
              >
                <Icon name={'shapes'} />
                <span>Appearance</span>
              </button>
              <button
                className="mf-menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openDocs();
                }}
              >
                <Icon name="book" />
                <span>Docs</span>
              </button>
              {slots && <div onClick={()=>setMenuOpen(false)}>{slots.workspaceActions}</div>}
              <span className="mf-menu-sep" />
              <button
                className="mf-menu-item mf-menu-danger"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  clearCanvas();
                }}
              >
                <Icon name="trash" />
                <span>Clear canvas</span>
              </button>
            </div>
          )}
        </div>
        {!slots && <ProductNav current="canvas" iconOnly={compactToolbar} />}
        {!slots && (
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={onPickFile} />
        )}
    </>
  );

  return (
    <div
      className={`mf-canvas${connecting ? ' is-connecting' : ''}${pending ? ' is-placing' : ''}${resizePreview || moveGuides ? ' is-transforming' : ''}`}
      onPointerDownCapture={() => {
        if (!draggingNodes.current) return;
        draggingNodes.current = false;
        setMoveGuides(null);
      }}
      onPointerMove={(e) => {
        pointer.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerLeave={() => {
        pointer.current = null;
      }}
    >
      {slots ? (slots.toolbar && createPortal(toolbar,slots.toolbar)) : (
        <div className={compactToolbar ? 'mf-toolbar is-compact' : 'mf-toolbar'}>{toolbar}</div>
      )}
      <ReactFlow ref={canvasRef}
        nodes={rfNodesWithGhost}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionStart={() => {
          selectingBox.current = true;
          selectionRect.current = null;
        }}
        onSelectionEnd={() => {
          selectingBox.current = false;
          const rect = selectionRect.current;
          const pane = flowStore.getState().domNode;
          if (!rect || !pane) return;
          const bounds = pane.getBoundingClientRect();
          const left = bounds.left + rect.x;
          const top = bounds.top + rect.y;
          const right = left + rect.width;
          const bottom = top + rect.height;
          const ids: string[] = [];
          for (const edge of pane.querySelectorAll<SVGGElement>('.react-flow__edge[data-id]')) {
            const path = edge.querySelector<SVGPathElement>('.react-flow__edge-path');
            const matrix = path?.getScreenCTM();
            const id = edge.dataset.id;
            if (!path || !matrix || !id) continue;
            const length = path.getTotalLength();
            const steps = Math.max(1, Math.ceil(length * Math.hypot(matrix.a, matrix.b) / 4));
            let previous = path.getPointAtLength(0).matrixTransform(matrix);
            for (let i = 1; i <= steps; i++) {
              const point = path.getPointAtLength(length * i / steps).matrixTransform(matrix);
              const dx = point.x - previous.x;
              const dy = point.y - previous.y;
              let start = 0;
              let end = 1;
              for (const [p, q] of [[-dx, previous.x - left], [dx, right - previous.x], [-dy, previous.y - top], [dy, bottom - previous.y]]) {
                if (p === 0) { if (q < 0) end = -1; }
                else if (p < 0) start = Math.max(start, q / p);
                else end = Math.min(end, q / p);
              }
              if (start <= end) { ids.push(id); break; }
              previous = point;
            }
          }
          setSelection(useDiagram.getState().selectedNodeIds, ids);
        }}
        onConnect={onConnect}
        connectionMode={ConnectionMode.Loose}
        onConnectStart={(_, p) => {
          dragFrom.current = p.nodeId;
          setConnecting(true);
        }}
        onConnectEnd={() => setConnecting(false)}
        connectionLineComponent={JoinPreview}
        elevateNodesOnSelect={false}
        colorMode={theme}
        deleteKeyCode={null}
        // Drag on empty canvas selects; middle/right drag or Space + drag pans.
        selectionOnDrag
        panOnDrag={slots ? false : [1, 2]}
        panActivationKeyCode={slots ? null : 'Space'}
        zoomOnScroll={!slots}
        zoomOnPinch={!slots}
        zoomOnDoubleClick={!slots}
        zoomActivationKeyCode={slots ? null : undefined}
        preventScrolling={!slots}
        autoPanOnNodeDrag={!slots}
        autoPanOnConnect={!slots}
        minZoom={slots ? 0.05 : undefined}
        fitView={!slots}
      >
        <NodeToolbar
          nodeId={selected.map(shown.endOf)}
          isVisible={groupAction !== null || !!single}
          position={Position.Top}
          offset={30}
        >
          <div className="mf-selbar">
            {single && <button className="mf-selbar-btn" title={explanation ? explanation.title || 'Untitled page' : 'Add explanation'} onClick={() => {
              const id = explanation?.id ?? useDiagram.getState().openPage(single.id);
              if (!id) return;
              showPage(single.id, id);
              useDock.getState().setMode(explanation ? 'read' : 'edit');
            }}>
              <Icon name="page" size={15} /><span>{explanation ? explanation.title || 'Untitled page' : 'Add explanation'}</span>
            </button>}
            {single && linkedDeck && <button className="mf-selbar-btn" title={`Present ${linkedDeck.title}`} onClick={() => {
              saveForNavigation();
              window.location.hash = deckHref(linkedDeck.id, single.id, 1);
            }}><Icon name="play" size={14} /><span>{linkedDeck.title || 'Untitled deck'}</span></button>}
            {groupAction && <button
              className="mf-selbar-btn"
              title={`${groupAction === 'ungroup' ? 'Ungroup' : groupAction === 'join' ? 'Add to group' : 'Group'}  ·  G`}
              onClick={groupSelection}
            >
              <Icon name="group" />
              <span>{groupAction === 'ungroup' ? 'Ungroup' : groupAction === 'join' ? 'Add to group' : 'Group'}</span>
              <kbd className="mf-tool-key" aria-hidden="true">G</kbd>
            </button>}
          </div>
        </NodeToolbar>
        {!embedded && (
          <>
            <Background
              gap={activeAppearance().texture === 'grid' ? 24 : 18}
              variant={activeAppearance().texture === 'grid' ? BackgroundVariant.Lines : BackgroundVariant.Dots}
            />
            <Controls />
            <MiniMap pannable zoomable style={{ width: 130, height: 90 }} />
          </>
        )}
      </ReactFlow>

      <NodeTransforms nodes={nodeRects} selected={selected} preview={resizePreview} moveGuides={moveGuides ?? []}
        disabled={Boolean(pending || connecting || foldPhase || moveGuides)} onPreview={setResizePreview}
        onCommit={commitResize} />

      {pending && (
        <div
          className="mf-place-overlay"
          onMouseMove={onPaneMouseMove}
          onClick={onPaneClick}
          onContextMenu={(e) => {
            e.preventDefault();
            cancelPending();
          }}
        >
          {cursor && (
            <div
              className={[
                'mf-place-ghost',
                `mf-place-${pending.image ? 'image' : pending.icon ? 'icon' : pending.shape}`,
                !pending.icon && !pending.image && hasOutline(pending.shape) ? 'is-outline' : '',
              ].join(' ')}
              style={{ left: cursor.x, top: cursor.y }}
            >
              {pending.image ? (
                <NodeImg image={pending.image} />
              ) : pending.icon ? (
                <CatalogIcon id={pending.icon} />
              ) : (
                hasOutline(pending.shape) && <ShapeOutline shape={pending.shape} style={{ sloppiness: 0 }} />
              )}
            </div>
          )}
        </div>
      )}
      {slots ? slots.stylePanel && createPortal(<StylePanel />, slots.stylePanel) : <StylePanel />}
      {notice && (
        <div className="mf-notice" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}

const SequenceEditor = lazy(() => import('./sequence/SequenceEditor'));
const AppearanceDialog = lazy(() => import('./components/AppearanceDialog'));

function DiagramEditor({ showWelcome, diagramKind, slots }: { showWelcome: boolean; diagramKind?:'flowchart'|'sequence'; slots?:EditorSlots }) {
  const panelOpen = useDock((s) => s.open);
  const setPanelOpen = useDock((s) => s.setOpen);
  const hash=useHash();
  const sequenceView = diagramKind ? diagramKind==='sequence' : hash === '#/diagrams/sequence';
  const [visited, setVisited] = useState(sequenceView);
  if (sequenceView && !visited) setVisited(true);
  const [panelWidth, setPanelWidth] = useState(360);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  useEffect(() => {
    if (exporting !== 'gif') return;
    const block = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    for (const type of ['keydown', 'keyup', 'copy', 'cut', 'paste']) window.addEventListener(type, block, true);
    return () => {
      for (const type of ['keydown', 'keyup', 'copy', 'cut', 'paste']) window.removeEventListener(type, block, true);
    };
  }, [exporting]);
  const [welcome, setWelcome] = useState(() => showWelcome && isFirstRun());

  // Clear canvas returns to the first-run view
  useEffect(() => {
    const show = () => setWelcome(true);
    window.addEventListener(WELCOME_EVENT, show);
    return () => window.removeEventListener(WELCOME_EVENT, show);
  }, []);

  return (
    <ReactFlowProvider>
      <Activity mode={sequenceView ? 'hidden' : 'visible'}>
        {welcome && <Welcome onDone={() => setWelcome(false)} />}
        <div className={slots ? 'mf-frame-editor' : 'mf-app'} inert={exporting === 'gif'}>
          <Canvas slots={slots} welcome={welcome} onTogglePanel={() => setPanelOpen(!useDock.getState().open)} exporting={exporting} setExporting={setExporting} />
          {!slots && (panelOpen ? (
            <MermaidPanel
              width={panelWidth}
              onWidthChange={setPanelWidth}
              onClose={() => setPanelOpen(false)}
            />
          ) : (
            <button
              className="mf-reopen"
              title="Mermaid  ·  M"
              aria-label="Open Mermaid panel"
              onClick={() => setPanelOpen(true)}
            >
              <Icon name="code" />
            </button>
          ))}
        </div>
        {exporting === 'gif' && (
          <div className="mf-export-overlay" role="status" aria-live="polite">
            <span>Exporting GIF…</span>
          </div>
        )}
      </Activity>
      {(sequenceView || visited) && <Activity mode={sequenceView ? 'visible' : 'hidden'}>
        <Suspense fallback={null}><SequenceEditor /><AppearanceDialog /></Suspense>
      </Activity>}
    </ReactFlowProvider>
  );
}

export default function App({showWelcome}:{showWelcome:boolean}) {
  if(window.__marmerladeRender)return <DiagramEditor showWelcome={showWelcome}/>;
  return <DiagramBoard Editor={DiagramEditor}/>;
}
