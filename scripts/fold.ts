// Fold logic check: creases reroute edges onto folded cards, fold levels step
// from the leaves inward, and sheets wrap their unfolded subtrees.
// Run with: node --experimental-strip-types scripts/fold.ts
import { SHEET_PAD, SHEET_TITLE, foldEdges, foldWithRoom, groupOrigin, groupPlan, hiddenIds, nextFoldLevel, nextUnfoldLevel, sheets, visibleGraph } from '../src/fold.ts';
import { fromMermaid, toMermaid } from '../src/mermaid/io.ts';
import { layoutShown } from '../src/layout.ts';
import type { DiagramEdge, DiagramNode } from '../src/types.ts';

const N = (id: string, parentId: string | null, collapsed = false, x = 0, y = 0): DiagramNode => ({
  id, label: id, shape: 'rect', parentId, collapsed, position: { x, y },
});
const E = (id: string, source: string, target: string, label?: string): DiagramEdge => ({ id, source, target, label });

let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) {
    failed++;
    console.error(`FAIL: ${name}`, detail ?? '');
  }
};

// A -> x, A -> y (x, y inside G), y -> B, G contains H contains z
const tree = (gFolded: boolean, hFolded = false) => [
  N('A', null), N('B', null), N('G', null, gFolded), N('x', 'G'), N('y', 'G'),
  N('H', 'G', hFolded), N('z', 'H'),
];
const edges = [E('1', 'A', 'x', 'calls'), E('2', 'A', 'y'), E('3', 'y', 'B', 'writes'), E('4', 'x', 'y'), E('5', 'z', 'B')];

{
  const nodes = tree(true);
  const { direct, folded } = foldEdges(nodes, edges, hiddenIds(nodes));
  check('no direct edges touch a hidden node', direct.length === 0, direct);
  const aG = folded.find((f) => f.source === 'A' && f.target === 'G');
  check('A->x and A->y merge into one A->G crease', aG?.count === 2 && aG.label === undefined, aG);
  const gB = folded.find((f) => f.source === 'G' && f.target === 'B');
  check('y->B and z->B merge into G->B', gB?.count === 2, gB);
  check('x->y (inside the card) disappears', folded.length === 2, folded);
}
{
  const nodes = tree(false, true);
  const { folded } = foldEdges(nodes, edges, hiddenIds(nodes));
  const hB = folded.find((f) => f.source === 'H' && f.target === 'B');
  check('nested fold reroutes to the nearest visible card', hB?.count === 1, folded);
}
{
  check('fold level folds innermost first', JSON.stringify(nextFoldLevel(tree(false))) === '["H"]');
  check('then the next level out', JSON.stringify(nextFoldLevel(tree(false, true))) === '["G"]');
  check('nothing left to fold', nextFoldLevel(tree(true, true)).length === 0);
  check('unfold level opens visible cards only', JSON.stringify(nextUnfoldLevel(tree(true, true))) === '["G"]');
}
{
  const nodes = [N('G', null, false, 100, 100), N('a', 'G', false, 100, 200), N('b', 'G', false, 300, 200)];
  const sh = sheets(nodes, hiddenIds(nodes), (n) => n.position, () => ({ width: 100, height: 50 }));
  const r = sh[0]?.rect;
  check('one sheet per unfolded group', sh.length === 1, sh);
  // children span x 100..400, y 200..250; the group's own card plays no part
  check('sheet wraps only the children, with padding and a title band', r && r.x === 100 - SHEET_PAD && r.y === 200 - SHEET_PAD - SHEET_TITLE && r.width === 300 + 2 * SHEET_PAD && r.height === 50 + 2 * SHEET_PAD + SHEET_TITLE, r);
  const none = sheets([{ ...nodes[0], collapsed: true }, nodes[1], nodes[2]], hiddenIds([{ ...nodes[0], collapsed: true }, nodes[1], nodes[2]]), (n) => n.position, () => ({ width: 100, height: 50 }));
  check('a folded group has no sheet', none.length === 0, none);
}
{
  // tree(): A, B, G at top level; x, y, H inside G; z inside H
  const t = tree(false);
  const top = groupPlan(t, ['A', 'B']);
  check('top-level siblings make a new group at top level', top?.kind === 'new' && top.parentId === null && top.members.join() === 'A,B', top);
  const inG = groupPlan(t, ['x', 'y']);
  check('some siblings in a sheet make a sub-group inside it', inG?.kind === 'new' && inG.parentId === 'G', inG);
  const solo = [N('S', null), N('p', 'S'), N('q', 'S'), N('r', null)];
  check("all of a group's children are already grouped", groupPlan(solo, ['p', 'q']) === null);
  check('all children of a group plus an outside node still group', groupPlan(solo, ['p', 'q', 'r'])?.kind === 'new');
  const mixed = groupPlan(t, ['x', 'z']);
  check('members from different depths nest under the deepest shared group', mixed?.kind === 'new' && mixed.parentId === 'G', mixed);
  const across = groupPlan(t, ['A', 'z']);
  check('no shared group means top level', across?.kind === 'new' && across.parentId === null, across);

  // a selected group is never wrapped in a new card: the rest join it
  const join = groupPlan(t, ['G', 'x', 'A', 'B']);
  check('a selected group takes in the others, not its own child', join?.kind === 'join' && join.groupId === 'G' && join.members.join() === 'A,B', join);
  const nested = groupPlan(t, ['H', 'A']);
  check('a nested group can take in an outside node', nested?.kind === 'join' && nested.groupId === 'H' && nested.members.join() === 'A', nested);
  check('a group with only its own contents selected is no plan', groupPlan(t, ['G', 'x', 'y', 'H', 'z']) === null);
  const two = [...t, N('K', null), N('k', 'K')];
  check('two groups selected is no plan', groupPlan(two, ['G', 'K']) === null && groupPlan(two, ['G', 'K', 'A']) === null);

  check('fewer than 2 members is no plan', groupPlan(t, ['A']) === null);
  check('unknown ids are ignored', groupPlan(t, ['A', 'nope']) === null);
}
{
  // a group sits at the top-left of its contents, whatever its own position
  const nodes = [{ ...N('F', null, false, 999, 999), label: '' }, N('a', 'F', false, 100, 200), N('b', 'F', false, 300, 260), N('H', 'F', false, -50, -50), N('c', 'H', false, 150, 180)];
  const o = groupOrigin('F', nodes);
  check('a group sits at the top-left of its contents, nested groups ignored', o?.x === 100 && o.y === 180, o);
  check('a plain node has no group origin', groupOrigin('a', nodes) === null);

  // Mermaid: an untitled group survives a round trip
  const mm = toMermaid({ nodes, edges: [] });
  check('untitled group exports a blank title', mm.includes('subgraph F [" "]'), mm);
  const back = fromMermaid(mm).nodes.find((n) => n.id === 'F');
  check('blank subgraph title imports as an untitled group', back?.label === '', back);
}

{
  // G holds x (0..100 x 0..50) and y (y 200..250); R sits beside it, B below
  const size = () => ({ width: 100, height: 50 });
  const open = [N('A', null, false, 0, -150), N('G', null, false), N('x', 'G', false, 0, 0), N('y', 'G', false, 0, 200),
    N('R', null, false, 200, 0), N('B', null, false, 0, 400), N('K', null, false), N('k1', 'K', false, 200, 100), N('k2', 'K', false, 400, 100)];
  const at = (ns: DiagramNode[], id: string) => ns.find((n) => n.id === id)!.position;
  const folded = foldWithRoom(open, ['G'], true, size);
  check('folding marks the group folded', folded.find((n) => n.id === 'G')?.collapsed === true);
  check('folding moves nothing', folded.every((n, i) => n.position === open[i].position));
  const back = foldWithRoom(folded, ['G'], false, size);
  check('unfolding into the same space moves nothing', JSON.stringify(back) === JSON.stringify(open), back);

  // tidied while folded: R crowds the card from the right, B from below
  const tight = folded.map((n) => n.id === 'R' ? { ...n, position: { x: 140, y: 0 } } : n.id === 'B' ? { ...n, position: { x: 0, y: 140 } } : n);
  const roomy = foldWithRoom(tight, ['G'], false, size);
  // sheet: x -22..122, y -44..272; card: 0..100 x 0..50
  check('unfold pushes the neighbour below down by the growth in height', at(roomy, 'B').y === 140 + (250 + SHEET_PAD - 50), at(roomy, 'B'));
  check('unfold pushes the neighbour beside it right by the growth in width', at(roomy, 'R').x === 140 + SHEET_PAD, at(roomy, 'R'));
  check('things above stay put', at(roomy, 'A').y === -150);
  check('a neighbouring group moves as one unit', at(roomy, 'k1').x - at(tight, 'k1').x === at(roomy, 'k2').x - at(tight, 'k2').x && at(roomy, 'k1').y - at(tight, 'k1').y === at(roomy, 'k2').y - at(tight, 'k2').y);
  check('the unfolded contents never move', at(roomy, 'x').x === 0 && at(roomy, 'y').y === 200);

  // nested: the inner sheet pushes its siblings, then the outer sheet its own
  const nest = [N('O', null), N('I', 'O', true), N('i1', 'I', false, 0, 0), N('i2', 'I', false, 0, 300), N('s', 'O', false, 0, 100), N('t', null, false, 0, 200)];
  const opened = foldWithRoom(nest, ['I'], false, size);
  const grow = 350 + SHEET_PAD - 50;
  check('unfolding inside a sheet pushes its siblings down', at(opened, 's').y === 100 + grow, at(opened, 's'));
  check('and the grown outer sheet pushes what lies below it', at(opened, 't').y > at(opened, 's').y + 50 + SHEET_PAD, at(opened, 't'));
}
{
  // Tidy with G folded: the card is ranked by its creases, and its contents follow it
  const nodes = tree(true);
  const laid = layoutShown(nodes, edges, 'TB');
  const g = groupOrigin('G', laid);
  const a = laid.find((n) => n.id === 'A')!.position;
  const b = laid.find((n) => n.id === 'B')!.position;
  check('the folded card lands where layout put it', !!g && Math.abs(g.x - laid.find((n) => n.id === 'G')!.position.x) < 1e-6 && Math.abs(g.y - laid.find((n) => n.id === 'G')!.position.y) < 1e-6, { g, laid });
  check('creases rank the card between A and B', !!g && a.y < g.y && g.y < b.y, { a, g, b });
}

{
  // visibleGraph: folded card, open sheet, and an edge between a group and its own child
  const folded = visibleGraph(tree(true), edges);
  check('folded: contents are offscreen', ['x', 'y', 'H', 'z'].every((id) => folded.offscreen.has(id)) && !folded.offscreen.has('G'), [...folded.offscreen]);
  check('folded: creases cover edges into the card', folded.folded.some((e) => e.source === 'A' && e.target === 'G') && folded.folded.some((e) => e.source === 'G' && e.target === 'B'), folded.folded);
  const open = visibleGraph(tree(false), edges);
  check('open: the group is a sheet, not a card', open.offscreen.has('G') && !open.offscreen.has('x'), [...open.offscreen]);
  check('open: edges between visible nodes are placed', open.placed.length === edges.length && open.folded.length === 0, open.placed);
  const own = visibleGraph(tree(false), [E('6', 'G', 'x')]);
  check('open: an edge from a group to its own child waits', own.placed.length === 0, own.placed);
  const empty = visibleGraph([], []);
  check('empty graph', empty.placed.length === 0 && empty.offscreen.size === 0);
}

if (failed) process.exit(1);
console.log('PASS: fold creases, levels, sheets and grouping');
