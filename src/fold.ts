// Origami folding: pure geometry + graph logic behind fold/unfold.
//
// A group is a sheet of paper. Expanded, its subtree sits on a visible sheet;
// folded, the subtree is tucked under the group card and every edge that
// pointed into it creases onto the card instead (so folding never loses
// context). Nothing here touches React or the store, so it is easy to test.

import type { Arrowheads, DiagramEdge, DiagramNode } from './types';

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

/** parentId -> children, built once per call site */
export function childrenOf(nodes: DiagramNode[]): Map<string | null, DiagramNode[]> {
  const m = new Map<string | null, DiagramNode[]>();
  for (const n of nodes) {
    const list = m.get(n.parentId);
    if (list) list.push(n);
    else m.set(n.parentId, [n]);
  }
  return m;
}

/** Every descendant id of `id` (not including `id`). */
export function descendants(
  id: string,
  kids: Map<string | null, DiagramNode[]>,
): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    for (const k of kids.get(p) ?? []) {
      out.push(k.id);
      walk(k.id);
    }
  };
  walk(id);
  return out;
}

/**
 * Where a group sits: the top-left of everything inside it. A group has no
 * card while unfolded, so its own stored position is never used.
 */
export function groupOrigin(
  id: string,
  nodes: DiagramNode[],
  kids: Map<string | null, DiagramNode[]> = childrenOf(nodes),
): { x: number; y: number } | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let x = Infinity;
  let y = Infinity;
  for (const d of descendants(id, kids)) {
    const n = byId.get(d);
    if (!n || kids.has(d)) continue; // a nested group's own position is meaningless
    x = Math.min(x, n.position.x);
    y = Math.min(y, n.position.y);
  }
  return Number.isFinite(x) ? { x, y } : null;
}

/** An unfolded group: drawn as a titled sheet, with no card on screen. */
export const isOpenGroup = (n: DiagramNode, kids: Map<string | null, DiagramNode[]>) =>
  !n.collapsed && kids.has(n.id);

/** Ids hidden because some ancestor is folded. */
export function hiddenIds(nodes: DiagramNode[]): Set<string> {
  const kids = childrenOf(nodes);
  const hidden = new Set<string>();
  for (const n of nodes) {
    if (n.collapsed) for (const d of descendants(n.id, kids)) hidden.add(d);
  }
  return hidden;
}

/**
 * Map a node to what is actually on screen: itself if visible, otherwise its
 * nearest visible ancestor (the folded card it is tucked under).
 */
function visibleProxy(
  id: string,
  byId: Map<string, DiagramNode>,
  hidden: Set<string>,
): string | null {
  let cur = byId.get(id);
  while (cur && hidden.has(cur.id)) {
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return cur?.id ?? null;
}

export interface FoldedEdge {
  id: string;
  source: string;
  target: string;
  /** the real edges this crease stands for */
  count: number;
  label?: string;
  style?: Pick<DiagramEdge['style'] & {}, 'arrowheads'>;
  flowArrowheads: Arrowheads;
}

function mergeArrowheads(a: Arrowheads, b: Arrowheads): Arrowheads {
  const start = a === 'start' || a === 'both' || b === 'start' || b === 'both';
  const end = a === 'end' || a === 'both' || b === 'end' || b === 'both';
  return start && end ? 'both' : start ? 'start' : end ? 'end' : 'none';
}

/**
 * Split edges into those drawn as-is and "creases": edges with a hidden end,
 * rerouted to the folded card and merged when several share the same ends.
 * Edges folded entirely inside one card disappear.
 */
export function foldEdges(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  hidden: Set<string>,
): { direct: DiagramEdge[]; folded: FoldedEdge[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const direct: DiagramEdge[] = [];
  const merged = new Map<string, FoldedEdge & { labels: Set<string> }>();
  for (const e of edges) {
    if (!hidden.has(e.source) && !hidden.has(e.target)) {
      direct.push(e);
      continue;
    }
    const s = visibleProxy(e.source, byId, hidden);
    const t = visibleProxy(e.target, byId, hidden);
    if (!s || !t || s === t) continue;
    const key = `${s}\u0000${t}`;
    const m = merged.get(key);
    const arrowheads = e.style?.arrowheads ?? 'none';
    const flowArrowheads = e.order === 0 ? 'none' : arrowheads;
    if (m) {
      m.count++;
      if (e.label) m.labels.add(e.label);
      m.style = { arrowheads: mergeArrowheads(m.style?.arrowheads ?? 'none', arrowheads) };
      m.flowArrowheads = mergeArrowheads(m.flowArrowheads, flowArrowheads);
    } else {
      merged.set(key, {
        id: `fold:${s}->${t}`,
        source: s,
        target: t,
        count: 1,
        style: { arrowheads },
        flowArrowheads,
        labels: new Set(e.label ? [e.label] : []),
      });
    }
  }
  // a direct edge already joining the same pair makes a crease redundant
  const directPairs = new Set(direct.map((e) => `${e.source}\u0000${e.target}`));
  const folded: FoldedEdge[] = [];
  for (const [key, { labels, ...f }] of merged) {
    if (directPairs.has(key)) continue;
    folded.push(labels.size === 1 && f.count === 1 ? { ...f, label: [...labels][0] } : f);
  }
  return { direct, folded };
}

/**
 * What a folded diagram shows: `offscreen` ids have no card (folded away, or
 * an unfolded group drawn as a sheet); `placed` are the direct edges that have
 * a path, still keyed by real node ids (an end on a sheet is its group id);
 * `folded` are the creases onto folded cards.
 */
export function visibleGraph(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const kids = childrenOf(nodes);
  const hidden = hiddenIds(nodes);
  const offscreen = new Set(hidden);
  for (const n of nodes) if (isOpenGroup(n, kids)) offscreen.add(n.id);
  const { direct, folded } = foldEdges(nodes, edges, hidden);
  // One between a group and its own contents has no sensible path, so it
  // waits until the group folds (and then folds away inside it).
  const inside = new Map<string, Set<string>>();
  const within = (g: string, id: string) => {
    if (!inside.has(g)) inside.set(g, new Set(descendants(g, kids)));
    return inside.get(g)!.has(id);
  };
  const placed = direct.filter((e) => {
    const s = offscreen.has(e.source);
    const t = offscreen.has(e.target);
    return !((s && within(e.source, e.target)) || (t && within(e.target, e.source)));
  });
  return { hidden, offscreen, direct, placed, folded };
}

/**
 * Groups to fold for one "fold a level" step: the innermost unfolded groups
 * on screen, so repeated presses fold the diagram from the leaves inward.
 */
export function nextFoldLevel(nodes: DiagramNode[]): string[] {
  const kids = childrenOf(nodes);
  const hidden = hiddenIds(nodes);
  const isOpenGroup = (n: DiagramNode) =>
    !n.collapsed && !hidden.has(n.id) && (kids.get(n.id)?.length ?? 0) > 0;
  const open = nodes.filter(isOpenGroup);
  const openIds = new Set(open.map((n) => n.id));
  return open
    .filter((g) => !descendants(g.id, kids).some((d) => openIds.has(d)))
    .map((g) => g.id);
}

/** Groups to unfold for one "unfold a level" step: every folded card on screen. */
export function nextUnfoldLevel(nodes: DiagramNode[]): string[] {
  const kids = childrenOf(nodes);
  const hidden = hiddenIds(nodes);
  return nodes
    .filter((n) => n.collapsed && !hidden.has(n.id) && (kids.get(n.id)?.length ?? 0) > 0)
    .map((n) => n.id);
}

export interface Sheet {
  /** the group this sheet belongs to */
  groupId: string;
  rect: Rect;
  /** nesting depth, 0 for a top-level group */
  depth: number;
}

export const SHEET_PAD = 22;
/** extra room above a sheet's contents for its group's title */
export const SHEET_TITLE = 22;

/**
 * One paper sheet per unfolded, on-screen group, sized to wrap its visible
 * children and any nested sheets, with a band on top for the group's title.
 * Ordered outermost first so nested sheets stack on top.
 */
export function sheets(
  nodes: DiagramNode[],
  hidden: Set<string>,
  positionOf: (n: DiagramNode) => { x: number; y: number },
  sizeOf: (n: DiagramNode) => Size,
): Sheet[] {
  const kids = childrenOf(nodes);
  const out: Sheet[] = [];
  const rectOf = (n: DiagramNode): Rect => ({ ...positionOf(n), ...sizeOf(n) });

  const build = (g: DiagramNode, depth: number): Rect => {
    const children = (kids.get(g.id) ?? []).filter((c) => !hidden.has(c.id));
    if (g.collapsed || hidden.has(g.id) || children.length === 0) return rectOf(g);
    // an open group has no card: its sheet wraps its children, plus a title band
    const index = out.length;
    out.push({ groupId: g.id, rect: rectOf(g), depth }); // placeholder, keeps outer sheets first
    const box = children.map((c) => build(c, depth + 1)).reduce(unionRects);
    const padded = pad(box, SHEET_PAD);
    const titleHeight = SHEET_TITLE * g.label.split('\n').length;
    const rect = { ...padded, y: padded.y - titleHeight, height: padded.height + titleHeight };
    out[index] = { groupId: g.id, rect, depth };
    return rect;
  };

  for (const root of kids.get(null) ?? []) build(root, 0);
  return out;
}

export function unionRects(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function pad(r: Rect, p: number): Rect {
  return { x: r.x - p, y: r.y - p, width: r.width + 2 * p, height: r.height + 2 * p };
}

export type GroupPlan =
  /** wrap `members` in a new group card nested under `parentId` */
  | { kind: 'new'; members: string[]; parentId: string | null }
  /** the selection already holds a group: move the other `members` into it */
  | { kind: 'join'; groupId: string; members: string[] };

export function ungroupTarget(nodes: DiagramNode[], ids: string[]): string | null {
  const picked = new Set(ids);
  const kids = childrenOf(nodes);
  if (picked.size === 1 && kids.has(ids[0])) return ids[0];
  if (picked.size < 2) return null;
  const first = nodes.find((node) => picked.has(node.id));
  const parent = first?.parentId;
  const siblings = parent ? kids.get(parent) : undefined;
  return siblings && siblings.length === picked.size && siblings.every((node) => picked.has(node.id))
    ? parent ?? null
    : null;
}

/**
 * Plan grouping a selection. A selected group brings its subtree along, so
 * only the outermost selected nodes count. With no group among them, they are
 * wrapped in a new group under the deepest group they already share. With
 * exactly one, the rest join that group rather than spawning a new card. With
 * nothing to move, several groups and no clear target, or a selection that is
 * exactly one group's contents (already grouped), there is no plan.
 */
export function groupPlan(nodes: DiagramNode[], ids: string[]): GroupPlan | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = childrenOf(nodes);
  const picked = new Set(ids.filter((id) => byId.has(id)));
  /** ancestors of a node, nearest first (not including the node) */
  const ancestors = (id: string): string[] => {
    const out: string[] = [];
    for (let p = byId.get(id)?.parentId ?? null; p; p = byId.get(p)?.parentId ?? null) {
      out.push(p);
    }
    return out;
  };
  const members = [...picked].filter((id) => !ancestors(id).some((a) => picked.has(a)));

  const groups = members.filter((id) => kids.has(id));
  if (groups.length > 1) return null;
  if (groups.length === 1) {
    const groupId = groups[0];
    const rest = members.filter((id) => id !== groupId);
    return rest.length > 0 ? { kind: 'join', groupId, members: rest } : null;
  }

  if (members.length < 2) return null;
  // already grouped: every child of one group, and nothing else, is selected
  const parent = byId.get(members[0])?.parentId ?? null;
  if (
    parent &&
    members.every((id) => byId.get(id)?.parentId === parent) &&
    members.length === (kids.get(parent)?.length ?? 0)
  ) {
    return null;
  }
  // deepest ancestor shared by every member
  let common = ancestors(members[0]);
  for (const id of members.slice(1)) {
    const mine = new Set(ancestors(id));
    common = common.filter((a) => mine.has(a));
  }
  return { kind: 'new', members, parentId: common[0] ?? null };
}

/** Where a node is drawn: a group's card sits at the top-left of its contents. */
function drawnAt(
  n: DiagramNode,
  nodes: DiagramNode[],
  kids: Map<string | null, DiagramNode[]>,
): { x: number; y: number } {
  return kids.has(n.id) ? groupOrigin(n.id, nodes, kids) ?? n.position : n.position;
}

/** Each on-screen group's sheet rect in `nodes`. */
function sheetRects(nodes: DiagramNode[], sizeOf: (n: DiagramNode) => Size): Map<string, Rect> {
  const kids = childrenOf(nodes);
  return new Map(
    sheets(nodes, hiddenIds(nodes), (n) => drawnAt(n, nodes, kids), sizeOf).map((s) => [s.groupId, s.rect]),
  );
}

/** clearance kept between a reopened sheet and its neighbours */
const ROOM_GAP = 8;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * `groupId` grew from `from` to `to`: if that runs into any of its siblings,
 * slide the ones below it down by the growth in height and the ones beside it
 * (in the sheet's rows) right by the growth in width, each with its subtree,
 * so the arrangement around the group is kept rather than crushed.
 */
function makeRoom(
  nodes: DiagramNode[],
  groupId: string,
  from: Rect,
  to: Rect,
  sizeOf: (n: DiagramNode) => Size,
): DiagramNode[] {
  const kids = childrenOf(nodes);
  const g = nodes.find((n) => n.id === groupId);
  if (!g) return nodes;
  const dx = Math.max(0, to.x + to.width - (from.x + from.width));
  const dy = Math.max(0, to.y + to.height - (from.y + from.height));
  if (dx === 0 && dy === 0) return nodes;
  const hidden = hiddenIds(nodes);
  const sheetOf = sheetRects(nodes, sizeOf);
  const zone = pad(to, ROOM_GAP);
  const moves: { id: string; by: { x: number; y: number } }[] = [];
  let collides = false;
  for (const s of kids.get(g.parentId) ?? []) {
    if (s.id === groupId || hidden.has(s.id)) continue;
    const box = sheetOf.get(s.id) ?? { ...drawnAt(s, nodes, kids), ...sizeOf(s) };
    let by: { x: number; y: number } | null = null;
    if (box.y >= from.y + from.height - 0.5) by = { x: 0, y: dy };
    else if (box.x >= from.x + from.width - 0.5 && box.y < to.y + to.height && box.y + box.height > to.y) {
      by = { x: dx, y: 0 };
    }
    if (!by || (by.x === 0 && by.y === 0)) continue;
    moves.push({ id: s.id, by });
    collides ||= overlaps(box, zone);
  }
  // the old spot still fits: leave the neighbours exactly where they are
  if (!collides) return nodes;
  const shift = new Map<string, { x: number; y: number }>();
  for (const { id, by } of moves) {
    shift.set(id, by);
    for (const d of descendants(id, kids)) shift.set(d, by);
  }
  return nodes.map((n) => {
    const by = shift.get(n.id);
    return by ? { ...n, position: { x: n.position.x + by.x, y: n.position.y + by.y } } : n;
  });
}

/**
 * Fold (`collapsed` true) or unfold groups. Folding leaves everything in
 * place, so unfolding into an unchanged diagram is an exact undo. If an
 * unfolded sheet would land on something (say the diagram was tidied while
 * the group was folded), its neighbours slide out of the way: those below by
 * the growth in height, those beside it by the growth in width. Each enclosing
 * sheet that grows as a result makes room among its own neighbours in turn.
 */
export function foldWithRoom(
  nodes: DiagramNode[],
  ids: string[],
  collapsed: boolean,
  sizeOf: (n: DiagramNode) => Size,
): DiagramNode[] {
  const target = new Set(ids);
  const flip = (ns: DiagramNode[], which: Set<string>) =>
    ns.map((n) => (which.has(n.id) && n.collapsed !== collapsed ? { ...n, collapsed } : n));
  if (collapsed) return flip(nodes, target);

  const kids = childrenOf(nodes);
  const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]));
  const depth = (id: string) => {
    let d = 0;
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) d++;
    return d;
  };
  // outermost first, so each step measures the sheets it will really sit in
  const order = [...target].filter((id) => kids.has(id)).sort((a, b) => depth(a) - depth(b));

  let cur = flip(nodes, new Set([...target].filter((id) => !kids.has(id))));
  for (const id of order) {
    const g = cur.find((n) => n.id === id);
    if (!g?.collapsed) continue;
    const before = cur;
    let next = flip(cur, new Set([id]));
    if (hiddenIds(next).has(id)) {
      cur = next; // inside a folded card: nothing on screen changes size
      continue;
    }
    const card = { ...drawnAt(g, before, kids), ...sizeOf(g) };
    const sheet = sheetRects(next, sizeOf).get(id);
    if (sheet) next = makeRoom(next, id, card, sheet, sizeOf);
    // the sheets around it may have grown too
    const old = sheetRects(before, sizeOf);
    for (let p = g.parentId; p; p = parentOf.get(p) ?? null) {
      const was = old.get(p);
      const now = sheetRects(next, sizeOf).get(p);
      if (!was || !now) break;
      next = makeRoom(next, p, was, now, sizeOf);
    }
    cur = next;
  }
  return cur;
}
