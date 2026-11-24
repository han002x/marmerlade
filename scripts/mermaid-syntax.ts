// Hand-written Mermaid flowchart syntax: every case must be valid for the REAL
// mermaid parser, import cleanly with parseMermaid, and mean what it says on
// the canvas (labels, arrowheads, line kinds, styles). Also checks that line
// kinds and styles survive export, re-import and the live-sync merge.
// Run with: node --experimental-strip-types scripts/mermaid-syntax.ts
import { JSDOM } from 'jsdom';
import { mergeDiagram, parseMermaid, toMermaid } from '../src/mermaid/io.ts';
import type { Diagram, DiagramEdge, DiagramNode } from '../src/types.ts';

// mermaid sanitizes labels with DOMPurify, which needs a DOM even to parse
const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document });
const { default: mermaid } = await import('mermaid');

let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) {
    failed++;
    console.error(`FAIL: ${name}`, detail === undefined ? '' : JSON.stringify(detail));
  }
};

const node = (d: Diagram, id: string) => d.nodes.find((n) => n.id === id);
const edge = (d: Diagram, from: string, to: string) => d.edges.find((e) => e.source === from && e.target === to);

/** A flowchart body that both parsers must accept, then the canvas checks on it. */
async function accepts(name: string, body: string, expect: (d: Diagram) => [string, boolean][] = () => []) {
  const src = body.startsWith('---') ? body : `flowchart TD\n  ${body.replace(/\n/g, '\n  ')}`;
  try {
    await mermaid.parse(src);
  } catch (err) {
    check(`${name}: real mermaid accepts it`, false, String((err as Error).message).split('\n')[0]);
    return;
  }
  const r = parseMermaid(src);
  if (!r.ok) return check(`${name}: marmerlade imports it`, false, r.error);
  for (const [what, ok] of expect(r.diagram)) check(`${name}: ${what}`, ok, r.diagram);
}

const one = (d: Diagram): DiagramEdge | undefined => (d.edges.length === 1 ? d.edges[0] : undefined);
const plainEdge = (d: Diagram, arrowheads = 'end'): [string, boolean][] => [
  ['one A->B edge', one(d)?.source === 'A' && one(d)?.target === 'B'],
  [`arrowheads ${arrowheads}`, one(d)?.style?.arrowheads === arrowheads],
];

// ---- statements ----
await accepts('semicolon terminator', 'A --> B;', (d) => plainEdge(d));
await accepts('several statements on one line', 'A --> B; B --> C', (d) => [['two edges', d.edges.length === 2]]);
await accepts('semicolon inside a label stays', 'A["a;b"] --> B', (d) => [['label kept', node(d, 'A')?.label === 'a;b']]);
await accepts('entity code is not a separator', 'A -- say #quot;hi#quot; --> B', (d) => [['label', one(d)?.label === 'say "hi"']]);
await accepts('subgraph direction', 'subgraph G\n  direction LR\n  A\nend', (d) => [['A in G', node(d, 'A')?.parentId === 'G']]);
await accepts('accTitle and accDescr', 'accTitle: T\naccDescr: D\nA --> B', (d) => plainEdge(d));
await accepts('multi-line accDescr', 'accDescr {\n  long\n  text\n}\nA --> B', (d) => plainEdge(d));
await accepts('YAML frontmatter', '---\ntitle: Hi\nconfig:\n  theme: dark\n---\nflowchart TD\n  A --> B', (d) => plainEdge(d));
await accepts('%%{init}%% directive', '%%{init: {"theme":"dark"}}%%\nA --> B', (d) => plainEdge(d));

// ---- links ----
await accepts('text on link', 'A -- label --> B', (d) => [...plainEdge(d), ['label', one(d)?.label === 'label']]);
await accepts('quoted text on link', 'A -- "a --> b" --> B', (d) => [['label', one(d)?.label === 'a --> b']]);
await accepts('open text link', 'A -- label --- B', (d) => plainEdge(d, 'none'));
await accepts('dotted text link', 'A -. label .-> B', (d) => [
  ...plainEdge(d),
  ['label', one(d)?.label === 'label'],
  ['dotted', one(d)?.style?.strokeStyle === 'dotted'],
]);
await accepts('thick text link', 'A == label ==> B', (d) => [...plainEdge(d), ['thick', (one(d)?.style?.strokeWidth ?? 1) >= 2]]);
await accepts('both-ways text link', 'A <-- label --> B', (d) => plainEdge(d, 'both'));
await accepts('longer arrow', 'A ----> B', (d) => plainEdge(d));
await accepts('longer open link', 'A ---- B', (d) => plainEdge(d, 'none'));
await accepts('longer dotted', 'A -...-> B', (d) => [...plainEdge(d), ['dotted', one(d)?.style?.strokeStyle === 'dotted']]);
await accepts('dotted open', 'A -.- B', (d) => [...plainEdge(d, 'none'), ['dotted', one(d)?.style?.strokeStyle === 'dotted']]);
await accepts('thick open', 'A === B', (d) => [...plainEdge(d, 'none'), ['thick', one(d)?.style?.strokeWidth === 2]]);
await accepts('thick arrow', 'A ==> B', (d) => [...plainEdge(d), ['thick', one(d)?.style?.strokeWidth === 2]]);
await accepts('solid stays plain', 'A --> B', (d) => [['no line style', !one(d)?.style?.strokeStyle && !one(d)?.style?.strokeWidth]]);
await accepts('circle head', 'A --o B', (d) => plainEdge(d));
await accepts('cross head', 'A --x B', (d) => plainEdge(d));
await accepts('circle heads both ways', 'A o--o B', (d) => plainEdge(d, 'both'));
await accepts('cross heads both ways', 'A x--x B', (d) => plainEdge(d, 'both'));
await accepts('o and x ids are not heads', 'o --> x', (d) => [['o->x', one(d)?.source === 'o' && one(d)?.target === 'x']]);
await accepts('dotted both ways', 'A <-.-> B', (d) => plainEdge(d, 'both'));
await accepts('thick both ways', 'A <==> B', (d) => plainEdge(d, 'both'));
await accepts('no-space arrows', 'A-->B-.->C==>D', (d) => [['three edges', d.edges.length === 3]]);
await accepts('invisible link draws nothing', 'A ~~~ B', (d) => [
  ['no edge', d.edges.length === 0],
  ['both nodes', d.nodes.length === 2],
]);
await accepts('pipe label on dotted', 'A -.->|x| B', (d) => [['label', one(d)?.label === 'x']]);
await accepts('& groups', 'A & B --> C & D', (d) => [['four edges', d.edges.length === 4]]);

// ---- edge ids ----
await accepts('edge id', 'A e1@--> B', (d) => [...plainEdge(d), ['no e1 node', !node(d, 'e1')]]);
await accepts('animated edge', 'A e1@--> B\ne1@{ animate: true }', (d) => [
  ['no e1 node', !node(d, 'e1')],
  ['flows', one(d)?.style?.animation === 'flow'],
]);
await accepts('fast animated edge', 'A e1@--> B\ne1@{ animation: fast }', (d) => [
  ['fast', one(d)?.style?.animation === 'flow' && one(d)?.style?.animationSpeed === 0.8],
]);
await accepts('animated edge by class', 'A e1@--> B\nclassDef go stroke-dasharray: 9,5,stroke-dashoffset: 900,animation: dash 25s linear infinite\nclass e1 go', (d) => [
  ['flows', one(d)?.style?.animation === 'flow'],
  ['dashed', one(d)?.style?.strokeStyle === 'dashed'],
]);

// ---- styling ----
await accepts('style statement', 'A --> B\nstyle A fill:#f9f,stroke:#333,stroke-width:4px,color:#fff', (d) => [
  ['fill', node(d, 'A')?.style?.background === '#f9f'],
  ['stroke', node(d, 'A')?.style?.stroke === '#333'],
  ['width', node(d, 'A')?.style?.strokeWidth === 4],
  ['text color', node(d, 'A')?.style?.fontColor === '#fff'],
  ['B untouched', node(d, 'B')?.style === undefined],
]);
await accepts('style with trailing semicolon', 'A\nstyle A fill:#f9f;', (d) => [['fill', node(d, 'A')?.style?.background === '#f9f']]);
await accepts('dashed border', 'A\nstyle A stroke-dasharray: 5 5', (d) => [['dashed', node(d, 'A')?.style?.strokeStyle === 'dashed']]);
await accepts('classDef + class', 'A --> B\nclassDef hot fill:#f96\nclass A,B hot', (d) => [
  ['A hot', node(d, 'A')?.style?.background === '#f96'],
  ['B hot', node(d, 'B')?.style?.background === '#f96'],
]);
await accepts('classDef after use', 'A:::hot --> B\nclassDef hot fill:#f96', (d) => [['A hot', node(d, 'A')?.style?.background === '#f96']]);
await accepts('inline class on a shaped node', 'A["x"]:::hot --> B\nclassDef hot fill:#f96', (d) => [
  ['label', node(d, 'A')?.label === 'x'],
  ['A hot', node(d, 'A')?.style?.background === '#f96'],
]);
await accepts('style beats class', 'A:::hot\nclassDef hot fill:#f96,stroke:#000\nstyle A fill:#00f', (d) => [
  ['fill from style', node(d, 'A')?.style?.background === '#00f'],
  ['stroke from class', node(d, 'A')?.style?.stroke === '#000'],
]);
await accepts('classDef default', 'subgraph G\n  A\nend\nclassDef default fill:#eee', (d) => [
  ['node gets default', node(d, 'A')?.style?.background === '#eee'],
  ['group does not', node(d, 'G')?.style === undefined],
]);
await accepts('linkStyle by index', 'A --> B\nB --> C\nlinkStyle 1 stroke:#f00,stroke-width:4px', (d) => [
  ['first untouched', edge(d, 'A', 'B')?.style?.stroke === undefined],
  ['second red', edge(d, 'B', 'C')?.style?.stroke === '#f00'],
  ['second wide', edge(d, 'B', 'C')?.style?.strokeWidth === 4],
]);
await accepts('linkStyle counts invisible links', 'A ~~~ B\nB --> C\nlinkStyle 1 stroke:#f00', (d) => [['B->C red', edge(d, 'B', 'C')?.style?.stroke === '#f00']]);
await accepts('linkStyle default', 'A --> B\nB --> C\nlinkStyle default stroke:#0f0', (d) => [
  ['all green', d.edges.every((e) => e.style?.stroke === '#0f0')],
]);
await accepts('linkStyle interpolate', 'A --> B\nlinkStyle 0 interpolate basis stroke:#0f0', (d) => [['green', one(d)?.style?.stroke === '#0f0']]);
{
  const r = parseMermaid('flowchart TD\n  A --> B\n  linkStyle 3 stroke:#f00');
  check('linkStyle past the last link is an error', !r.ok && /out of range/.test(r.error), r);
}

// ---- clicks ----
await accepts('external click', 'A --> B\nclick A href "https://example.com" "tip" _blank', (d) => [['no page link', node(d, 'A')?.pageIds === undefined]]);
await accepts('click shorthand', 'A --> B\nclick A "https://example.com"', (d) => plainEdge(d));
await accepts('click callback', 'A --> B\nclick A callback "tip"', (d) => plainEdge(d));
await accepts('click call', 'A --> B\nclick A call go()', (d) => plainEdge(d));

// ---- ids and labels ----
await accepts('hyphen id', 'my-node["X"] --> B', (d) => [['renamed', node(d, 'my_node')?.label === 'X' && edge(d, 'my_node', 'B') !== undefined]]);
await accepts('dot id', 'a.b --> B', (d) => [['renamed', edge(d, 'a_b', 'B') !== undefined]]);
await accepts('renamed id avoids a written one', 'a-b --> a_b', (d) => [
  ['two nodes', d.nodes.length === 2],
  ['plain id kept', node(d, 'a_b') !== undefined && node(d, 'a_b_2') !== undefined],
]);
await accepts('quoted subgraph title', 'subgraph "My group"\n  A\nend', (d) => [
  ['clean id', node(d, 'My_group')?.label === 'My group'],
  ['A inside', node(d, 'A')?.parentId === 'My_group'],
]);
await accepts('subgraph id with title', 'subgraph g-1 ["Title"]\n  A\nend', (d) => [['renamed', node(d, 'g_1')?.label === 'Title']]);
await accepts('markdown label', 'A["`**bold** and *it*`"]', (d) => [['plain text', node(d, 'A')?.label === 'bold and it']]);
await accepts('entity codes', 'A["#quot;hi#quot; #35; #9829;"]', (d) => [['decoded', node(d, 'A')?.label === '"hi" # ♥']]);
await accepts('line breaks', 'A["a<br/>b"]', (d) => [['newline', node(d, 'A')?.label === 'a\nb']]);

// ---- export: line kinds and awkward labels survive real mermaid and re-import ----
{
  const n = (id: string, label: string): DiagramNode => ({ id, label, shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 } });
  const d: Diagram = {
    nodes: [n('A', 'say "hi" #1; ok'), n('B', 'b'), n('C', 'c'), n('D', 'd')],
    edges: [
      { id: 'e0', source: 'A', target: 'B', label: 'a|b "c"', style: { arrowheads: 'end', strokeStyle: 'dashed' } },
      { id: 'e1', source: 'B', target: 'C', style: { arrowheads: 'both', strokeWidth: 4 } },
      { id: 'e2', source: 'C', target: 'D', style: { arrowheads: 'none', strokeStyle: 'dotted' } },
    ],
  };
  const text = toMermaid(d);
  try {
    await mermaid.parse(text);
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
    const db = diagram.db as unknown as {
      getEdges(): { stroke: string; type: string; text: string }[];
      getVertices(): Map<string, { text?: string }>;
    };
    const strokes = db.getEdges().map((e) => e.stroke);
    check('mermaid draws dashed/thick/dotted as dotted/thick/dotted', strokes.join() === 'dotted,thick,dotted', strokes);
    check('mermaid reads the dotted arrow', db.getEdges()[0].type === 'arrow_point', db.getEdges()[0]);
  } catch (err) {
    check('real mermaid accepts the export', false, (err as Error).message);
  }
  const back = parseMermaid(text);
  check('export re-imports', back.ok, back);
  if (back.ok) {
    check('quote and # survive the round trip', node(back.diagram, 'A')?.label === 'say "hi" #1; ok', back.diagram.nodes[0]);
    check('edge label survives the round trip', back.diagram.edges[0].label === 'a|b "c"', back.diagram.edges[0]);
    const merged = mergeDiagram(back.diagram, d);
    check('merge keeps the canvas dash pattern', merged.edges[0].style?.strokeStyle === 'dashed', merged.edges[0]);
    check('merge keeps the canvas width', merged.edges[1].style?.strokeWidth === 4, merged.edges[1]);
    check('merge keeps a dotted edge dotted', merged.edges[2].style?.strokeStyle === 'dotted', merged.edges[2]);
    check('merge leaves the export unchanged', toMermaid(merged) === text, toMermaid(merged));
  }
  // retyping the line kind in the text restyles the edge
  const solid = parseMermaid(text.replace('-.->', '-->').replace('<==>', '<-->'));
  if (solid.ok) {
    const merged = mergeDiagram(solid.diagram, d);
    check('typing --> over -.-> makes it solid', merged.edges[0].style?.strokeStyle === undefined, merged.edges[0]);
    check('typing <--> over <==> makes it thin', merged.edges[1].style?.strokeWidth === undefined, merged.edges[1]);
  } else check('retyped text parses', false, solid);
  // a typed style line restyles an existing node; canvas styling stays under it
  const styled = parseMermaid(`${text}\n  style B fill:#f00`);
  const base: Diagram = { ...d, nodes: d.nodes.map((x) => (x.id === 'B' ? { ...x, style: { stroke: '#123' } } : x)) };
  if (styled.ok) {
    const b = node(mergeDiagram(styled.diagram, base), 'B');
    check('typed style applies over the canvas style', b?.style?.background === '#f00' && b?.style?.stroke === '#123', b);
  } else check('styled text parses', false, styled);
}

// ---- live sync through the store ----
{
  const { useDiagram } = await import('../src/store.ts');
  const { parseDiagram } = await import('../src/workspaceSchema.ts');
  useDiagram.setState({ nodes: [], edges: [], history: [] });
  const st = () => useDiagram.getState();
  const src = 'flowchart TD\n  my-api["API"] -.->|calls| db[(DB)]; db ==> cache\n  style db fill:#f96';
  check('store sync imports the text', st().syncMermaid(src).ok);
  check('store gets the typed style', st().nodes.find((x) => x.id === 'db')?.style?.background === '#f96', st().nodes);
  check('store gets the dotted line', st().edges[0]?.style?.strokeStyle === 'dotted', st().edges);
  const saved = (() => {
    try {
      parseDiagram({ nodes: st().nodes, edges: st().edges });
      return true;
    } catch (err) {
      return String(err);
    }
  })();
  check('renamed ids pass the workspace schema', saved === true, saved);
  const nodesBefore = st().nodes;
  st().syncMermaid(src);
  check('re-syncing the same text changes nothing', st().nodes === nodesBefore);
  st().syncMermaid(st().exportMermaid());
  check('syncing the export back changes nothing', st().nodes === nodesBefore);
  st().syncMermaid(src.replace('#f96', '#00f'));
  check('editing a style line restyles the node', st().nodes.find((x) => x.id === 'db')?.style?.background === '#00f', st().nodes);
}

// ---- an import (paste) is tidied as a whole, in the header's direction ----
{
  const { useDiagram } = await import('../src/store.ts');
  const { layoutShown } = await import('../src/layout.ts');
  const { mermaidDirection } = await import('../src/mermaid/io.ts');
  check('LR header lays out left to right', mermaidDirection('%% note\ngraph LR\n a-->b') === 'LR');
  check('RL header lays out horizontally', mermaidDirection('flowchart RL\n a-->b') === 'LR');
  check('TD header lays out top to bottom', mermaidDirection('flowchart TD\n a-->b') === 'TB');
  check('bare header defaults to top to bottom', mermaidDirection('flowchart\n a-->b') === 'TB');
  check('a header pasted under the old one wins', mermaidDirection('flowchart TD\nflowchart LR\n a-->b') === 'LR');

  const st = () => useDiagram.getState();
  // an existing node far off at a hand-placed spot, then a big paste around it
  useDiagram.setState({ nodes: [], edges: [], history: [] });
  st().syncMermaid('flowchart LR\n  a');
  useDiagram.setState({ nodes: st().nodes.map((n) => ({ ...n, position: { x: 5000, y: -3000 } })) });
  const history = st().history.length;
  const pasted = ['flowchart LR', ...Array.from({ length: 30 }, (_, i) => `  ${i ? `n${i - 1}` : 'a'} --> n${i}`)].join('\n');
  check('pasted text syncs', st().syncMermaid(pasted, { tidy: true }).ok);
  const tidy = layoutShown(st().nodes, st().edges, 'LR').nodes;
  const moved = st().nodes.filter((n, i) => n.position.x !== tidy[i].position.x || n.position.y !== tidy[i].position.y);
  check('every node, old and new, sits where Tidy puts it', moved.length === 0, moved.map((n) => n.id));
  check('the hand-placed node was tidied too', st().nodes.find((n) => n.id === 'a')?.position.x !== 5000);
  check('the import is one new undo step', st().history.length === history + 1, st().history.length);

  // each edge keeps Tidy's route, leaving and entering across the ranks
  const routes = st().edges.map((e) => e.route);
  check('every tidied edge has a route', routes.every(Boolean), st().edges.filter((e) => !e.route).map((e) => e.id));
  check('LR routes leave right and enter left', routes.every((r) => r?.sourceSide === 'right' && r.targetSide === 'left'), routes.map((r) => r && `${r.sourceSide}/${r.targetSide}`));
  const fits = st().edges.every((e) => {
    const at = (id: string) => st().nodes.find((n) => n.id === id)!.position;
    return e.route && e.route.from.x === at(e.source).x && e.route.to.y === at(e.target).y;
  });
  check('routes record the end positions they fit', fits);
  const { parseDiagram } = await import('../src/workspaceSchema.ts');
  const saved = parseDiagram({ nodes: st().nodes, edges: st().edges });
  check('routes survive the workspace schema', saved.edges.every((e, i) => JSON.stringify(e.route) === JSON.stringify(st().edges[i].route)));

  // typing (no tidy) still leaves existing positions alone
  useDiagram.setState({ nodes: st().nodes.map((n) => (n.id === 'a' ? { ...n, position: { x: 5000, y: -3000 } } : n)) });
  st().syncMermaid(pasted + '\n  n29 --> extra');
  check('a typed edit keeps hand-placed positions', st().nodes.find((n) => n.id === 'a')?.position.x === 5000);
  check('a typed edit keeps the routes of edges it did not touch', !!st().edges.find((e) => e.source === 'n5' && e.target === 'n6')?.route);

  // a back edge runs against the ranks: it leaves the top and enters the bottom
  useDiagram.setState({ nodes: [], edges: [], history: [] });
  st().syncMermaid('flowchart TD\n  a --> b --> c\n  c --> a', { tidy: true });
  const back = st().edges.find((e) => e.source === 'c' && e.target === 'a')?.route;
  check('a TD back edge leaves the top and enters the bottom', back?.sourceSide === 'top' && back.targetSide === 'bottom', back);
  check('a TD back edge bends around the nodes between', (back?.points.length ?? 0) > 1, back);
  const fwd = st().edges.find((e) => e.source === 'a' && e.target === 'b')?.route;
  check('a TD forward edge leaves the bottom and enters the top', fwd?.sourceSide === 'bottom' && fwd.targetSide === 'top', fwd);
}

// ---- a flowchart keeps its direction ----
{
  const { useDiagram, workspaceDiagram } = await import('../src/store.ts');
  const { parseMermaid, toMermaid } = await import('../src/mermaid/io.ts');
  const { parseDiagram } = await import('../src/workspaceSchema.ts');
  const lr = parseMermaid('flowchart LR\n  a --> b');
  check('an LR header parses to an LR diagram', lr.ok && lr.diagram.direction === 'LR', lr);
  check('an LR diagram exports an LR header', lr.ok && toMermaid(lr.diagram).startsWith('flowchart LR'));
  const td = parseMermaid('flowchart TD\n  a --> b');
  check('a TD diagram exports a TD header', td.ok && !td.diagram.direction && toMermaid(td.diagram).startsWith('flowchart TD'));

  const st = () => useDiagram.getState();
  useDiagram.setState({ nodes: [], edges: [], history: [], direction: 'TB', diagrams: undefined, activeDiagramId: null });
  st().syncMermaid('flowchart TD\n  a --> b');
  st().syncMermaid('flowchart LR\n  a --> b');
  check('turning the header turns the diagram', st().direction === 'LR');
  check('the exported text keeps the turn', st().exportMermaid().startsWith('flowchart LR'));
  check('the saved diagram keeps the turn', workspaceDiagram().direction === 'LR' && parseDiagram(workspaceDiagram()).direction === 'LR');
  st().undo();
  check('undo turns it back', st().direction === 'TB', st().direction);

  // a workspace diagram keeps its direction on its entity across open/close
  st().createDiagram({ kind: 'flowchart', nodes: [], edges: [] });
  const id = st().activeDiagramId!;
  st().syncMermaid('flowchart LR\n  x --> y');
  st().openDiagram(null);
  const entity = workspaceDiagram().diagrams?.find((e) => e.id === id);
  check('a closed diagram keeps its direction', entity?.kind === 'flowchart' && entity.direction === 'LR', entity);
  st().openDiagram(id);
  check('reopening restores it', st().direction === 'LR');
  useDiagram.setState({ diagrams: undefined, activeDiagramId: null, direction: 'TB' });
}

// ---- the routed edge path ----
{
  const { routedPath } = await import('../src/edgePath.ts');
  const [d, lx, ly] = routedPath({ x: 0, y: 0 }, [{ x: 0, y: 50 }, { x: 100, y: 50 }], { x: 100, y: 100 });
  check('a routed path starts at the source handle', d.startsWith('M0,0'), d);
  check('a routed path ends at the target handle', d.endsWith('L100,100'), d);
  check('a routed path label sits halfway along the route', lx === 50 && ly === 50, [lx, ly]);
  const [straight] = routedPath({ x: 0, y: 0 }, [], { x: 0, y: 10 });
  check('a route with no bends is a straight line', straight === 'M0,0L0,10', straight);

  // a routed edge meets each node on its outline, where the route points
  const { borderPoint } = await import('../src/edgePath.ts');
  const box = { x: 0, y: 0, width: 100, height: 40 };
  const below = borderPoint(box, 'rect', { x: 50, y: 200 });
  check('a rect end sits on its bottom edge below it', below.x === 50 && below.y === 40, below);
  const slant = borderPoint(box, 'rect', { x: 150, y: 70 });
  check('a slanted rect end sits on the box', Math.abs(slant.x - 100) < 1e-9 || Math.abs(slant.y - 40) < 1e-9, slant);
  const tip = borderPoint({ x: 0, y: 0, width: 80, height: 80 }, 'diamond', { x: 40, y: 300 });
  check('a diamond end below it is its bottom tip', Math.abs(tip.x - 40) < 1e-9 && Math.abs(tip.y - 80) < 1e-9, tip);
  const side = borderPoint({ x: 0, y: 0, width: 80, height: 80 }, 'diamond', { x: 140, y: 140 });
  check('a diagonal diamond end sits on its edge, not the box corner', Math.abs(side.x - 60) < 1e-9 && Math.abs(side.y - 60) < 1e-9, side);
  const ring = borderPoint({ x: 0, y: 0, width: 80, height: 80 }, 'circle', { x: 140, y: 140 });
  check('a circle end sits on the circle', Math.abs(Math.hypot(ring.x - 40, ring.y - 40) - 40) < 1e-9, ring);
}

// ---- Tidy makes room for edge labels ----
{
  const { layoutShown } = await import('../src/layout.ts');
  const { parseMermaid } = await import('../src/mermaid/io.ts');
  const parsed = parseMermaid('flowchart TD\n  a -->|a rather long label| b\n  a --> c');
  if (parsed.ok) {
    const { nodes, edges } = layoutShown(parsed.diagram.nodes, parsed.diagram.edges, 'TB');
    const labelled = edges.find((e) => e.label)!.route;
    const plain = edges.find((e) => !e.label)!.route;
    const at = (id: string) => nodes.find((n) => n.id === id)!.position;
    check('a labelled edge has a label spot', !!labelled?.label, labelled);
    check('an unlabelled edge has none', plain && !plain.label, plain);
    check('the label spot lies between its ends', !!labelled?.label && labelled.label.y > at('a').y && labelled.label.y < at('b').y, labelled);
  } else check('labelled text parses', false, parsed);
}

if (failed) process.exit(1);
console.log('PASS: hand-written mermaid syntax imports as meant, and line kinds round-trip');
