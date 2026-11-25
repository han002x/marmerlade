// Edge sides: an unpinned end faces the other node; pinning, unpinning and
// moving an end through the store.
// Run with: node --experimental-strip-types scripts/sides.ts
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
(globalThis as { window?: unknown }).window = new JSDOM('').window;
const { autoSides } = await import('../src/edgePath.ts');
const { useDiagram } = await import('../src/store.ts');
import type { DiagramNode } from '../src/types.ts';

const box = (x: number, y: number, width = 120, height = 40) => ({ x, y, width, height });

// ---- autoSides ----
assert.deepEqual(autoSides(box(0, 0), box(0, 120)), ['bottom', 'top'], 'below: bottom → top');
assert.deepEqual(autoSides(box(0, 120), box(0, 0)), ['top', 'bottom'], 'above: top → bottom');
assert.deepEqual(autoSides(box(0, 0), box(300, 0)), ['right', 'left'], 'to the right: right → left');
assert.deepEqual(autoSides(box(300, 0), box(0, 0)), ['left', 'right'], 'to the left: left → right');
// wide nodes stacked a little off-centre still join vertically: the clear gap
// is what counts, not the centre offset
assert.deepEqual(autoSides(box(0, 0, 200), box(130, 100, 200)), ['bottom', 'top'], 'wide, offset: vertical');
// a moved node past the side of its neighbour turns the edge horizontal
assert.deepEqual(autoSides(box(0, 0), box(240, 60)), ['right', 'left'], 'diagonal, mostly sideways');
// a tie goes the flow's way
const square = (x: number, y: number) => box(x, y, 40, 40);
assert.deepEqual(autoSides(square(0, 0), square(100, 100), 'TB'), ['bottom', 'top'], 'tie in TB: vertical');
assert.deepEqual(autoSides(square(0, 0), square(100, 100), 'LR'), ['right', 'left'], 'tie in LR: horizontal');

// ---- store ----
const node = (id: string): DiagramNode => ({ id, label: id, shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 } });
const reset = () => useDiagram.setState({ nodes: [node('a'), node('b'), node('c')], edges: [], history: [], future: [] });
const edge = () => useDiagram.getState().edges[0];

// a join keeps both sides the user drew it between, bottom/top included
reset();
useDiagram.getState().connect('a', 'b', 'bottom', 'top');
assert.equal(edge().sourceSide, 'bottom');
assert.equal(edge().targetSide, 'top');

// pin, unpin; a pin drops the stale Tidy route
reset();
useDiagram.setState({ edges: [{ id: 'e', source: 'a', target: 'b', label: 'go', route: { sourceSide: 'bottom', targetSide: 'top', points: [], from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } }] });
useDiagram.getState().setEdgeSides('e', { sourceSide: 'left' });
assert.equal(edge().sourceSide, 'left');
assert.equal(edge().targetSide, undefined);
assert.equal(edge().route, undefined);
useDiagram.getState().setEdgeSides('e', { sourceSide: null });
assert.equal('sourceSide' in edge(), false, 'null unpins');
useDiagram.getState().undo();
assert.equal(edge().sourceSide, 'left', 'undo restores the pin');

// move an end to another node: label kept, refused onto itself or a duplicate
useDiagram.getState().reconnectEdge('e', { source: 'a', target: 'c', targetSide: 'left' });
assert.equal(edge().target, 'c');
assert.equal(edge().targetSide, 'left');
assert.equal(edge().label, 'go');
const before = useDiagram.getState().edges;
useDiagram.getState().reconnectEdge('e', { source: 'a', target: 'a' });
assert.equal(useDiagram.getState().edges, before, 'no self-loop');
useDiagram.setState({ edges: [...before, { id: 'f', source: 'a', target: 'b' }] });
useDiagram.getState().reconnectEdge('e', { source: 'a', target: 'b' });
assert.equal(edge().target, 'c', 'no duplicate edge');

console.log('PASS: auto sides, pin/unpin, reconnect');
