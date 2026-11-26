// Sequenced flow: the order a pulse travels the visible connections.
//
// Pure (no React, no DOM) so it can be tested under node. Time is measured in
// steps: step k plays while the clock reads k..k+1, so an edge's progress is
// clamp(t - step, 0, 1) and a node lights once the clock passes its arrival.

import type { Arrowheads, ElementStyle } from './types';

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  /** 0 excludes the edge; positive values override the traversal order */
  order?: number;
  style?: Pick<ElementStyle, 'arrowheads'>;
  /** A folded crease may draw more directions than it actually plays. */
  flowArrowheads?: Arrowheads;
}

export interface FlowSchedule {
  /** edge id -> the step it plays in */
  edgeStep: Map<string, number>;
  /** direction of the first traversal, relative to the edge's endpoints */
  edgeDirection: Map<string, 'start' | 'end' | 'both'>;
  /** node id -> the clock time its first pulse starts or arrives */
  nodeAt: Map<string, number>;
  /** how many steps the sequence has */
  steps: number;
  /** changes whenever the schedule does, so a player knows to restart */
  sig: string;
}

/** seconds one step lasts at 1x speed */
export const HOP_SECONDS = 0.9;
/** steps the finished diagram stays lit before the loop clears */
export const FLOW_HOLD = 1;
/** steps the diagram stays clear before the loop begins again */
export const FLOW_LEAD = 0.5;

/** Length of one loop, in steps. */
export const flowCycle = (steps: number) => steps + FLOW_HOLD + FLOW_LEAD;

/** Seconds one loop lasts at `speed`. */
export const flowSeconds = (steps: number, speed: number) =>
  steps > 0 ? (flowCycle(steps) * HOP_SECONDS) / speed : 0;

/**
 * Plan the sequence over the edges on screen. Start nodes (no incoming edge)
 * fire first; every edge plays one step after the one that reached its source,
 * so branches run together. A diagram with no start node (a cycle) begins at
 * its first edge's source. Each edge plays once, so cycles terminate.
 */
export function flowSchedule(edges: FlowEdge[]): FlowSchedule {
  const arrowheads = (edge: FlowEdge) => edge.order === 0 ? 'none' : edge.flowArrowheads ?? edge.style?.arrowheads ?? 'none';
  const active = edges.filter((edge) => arrowheads(edge) !== 'none');
  const arcs = active.flatMap((edge) => {
    const direction = arrowheads(edge);
    return [
      ...(direction === 'end' || direction === 'both' ? [{ edge, from: edge.source, to: edge.target }] : []),
      ...(direction === 'start' || direction === 'both' ? [{ edge, from: edge.target, to: edge.source }] : []),
    ];
  });
  const out = new Map<string, typeof arcs>();
  const incoming = new Set<string>();
  const ids: string[] = [];
  const see = (id: string) => {
    if (!out.has(id)) {
      out.set(id, []);
      ids.push(id);
    }
  };
  for (const arc of arcs) {
    see(arc.from);
    see(arc.to);
    out.get(arc.from)!.push(arc);
    incoming.add(arc.to);
  }

  // breadth-first from the start nodes; leftovers (cycles) seed from the first
  // unvisited node, so every edge gets a depth
  const depth = new Map<string, number>();
  const queue: string[] = [];
  const reach = (id: string, d: number) => {
    if (depth.has(id)) return;
    depth.set(id, d);
    queue.push(id);
  };
  const drain = () => {
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      for (const arc of out.get(id) ?? []) reach(arc.to, depth.get(id)! + 1);
    }
    queue.length = 0;
  };
  for (const id of ids) if (!incoming.has(id)) reach(id, 0);
  drain();
  for (const id of ids) {
    if (!depth.has(id)) {
      reach(id, 0);
      drain();
    }
  }

  const edgeStep = new Map<string, number>();
  const edgeDirection = new Map<string, 'start' | 'end' | 'both'>();
  const nodeAt = new Map<string, number>();
  const light = (id: string, at: number) => nodeAt.set(id, Math.min(nodeAt.get(id) ?? Infinity, at));
  for (const e of active) {
    const manual = e.order != null && Number.isFinite(e.order) ? Math.max(1, Math.floor(e.order)) - 1 : null;
    const direction = arrowheads(e);
    const sourceDepth = depth.get(e.source);
    const targetDepth = depth.get(e.target);
    if (sourceDepth === undefined || targetDepth === undefined || !direction || direction === 'none') continue;
    const travel = direction === 'both'
      ? sourceDepth === targetDepth ? 'both' : sourceDepth < targetDepth ? 'end' : 'start'
      : direction;
    const step = manual ?? (travel === 'start' ? targetDepth : sourceDepth);
    edgeStep.set(e.id, step);
    edgeDirection.set(e.id, travel);
    if (travel !== 'start') {
      light(e.source, step);
      light(e.target, step + 1);
    }
    if (travel !== 'end') {
      light(e.target, step);
      light(e.source, step + 1);
    }
  }

  let steps = 0;
  for (const s of edgeStep.values()) steps = Math.max(steps, s + 1);
  const sig = `${steps}|${active.map((e) => `${e.id}:${e.source}:${e.target}:${arrowheads(e)}:${edgeStep.get(e.id)}:${edgeDirection.get(e.id)}`).join(',')}`;
  return { edgeStep, edgeDirection, nodeAt, steps, sig };
}
