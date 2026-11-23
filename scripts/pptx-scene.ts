// PowerPoint scene check: shapes map to presets, folded/open groups, edges and
// slide fit. Run with: node --experimental-strip-types scripts/pptx-scene.ts
import { PRESETS, SLIDE_H, SLIDE_W, buildScene, hex, type Palette, type SceneItem } from '../src/pptx/scene.ts';
import { SHAPES } from '../src/shapes.ts';
import type { DiagramEdge, DiagramNode } from '../src/types.ts';

const palette: Palette = { bg: '#fbf7ee', ink: '#2a2723', node: '#ffffff', group: '#f1ead9', text: '#2a2723', border: '#b9ae96', font: 'Inter' };
const N = (id: string, parentId: string | null, x = 0, y = 0, extra: Partial<DiagramNode> = {}): DiagramNode =>
  ({ id, label: id, shape: 'rect', parentId, collapsed: false, position: { x, y }, ...extra });
const E = (id: string, source: string, target: string, extra: Partial<DiagramEdge> = {}): DiagramEdge => ({ id, source, target, ...extra });

let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) { failed++; console.error(`FAIL: ${name}`, detail ?? ''); }
};
const shapes = (items: SceneItem[]) => items.filter((i): i is Extract<SceneItem, { kind: 'shape' }> => i.kind === 'shape');
const lines = (items: SceneItem[]) => items.filter((i): i is Extract<SceneItem, { kind: 'line' }> => i.kind === 'line');
const texts = (items: SceneItem[]) => items.flatMap((i) => (i.kind === 'line' || i.kind === 'image' ? [] : i.kind === 'text' ? [i.text.value] : i.text ? [i.text.value] : []));

check('every node shape has a preset', SHAPES.every((s) => PRESETS[s.shape]), SHAPES.map((s) => s.shape));
check('hex accepts 3 and 6 digit colours only', hex('#ABC', 'x') === '#aabbcc' && hex('var(--mf-ink)', '#111111') === '#111111' && hex('red', '#222222') === '#222222');

{
  const nodes = [N('a', null, 0, 0), N('b', null, 300, 0, { shape: 'diamond' }), N('c', null, 0, 200, { shape: 'trap-t', label: 'flipped' })];
  const edges = [E('1', 'a', 'b', { label: 'go', style: { arrowheads: 'end' } }), E('2', 'a', 'c')];
  const scene = buildScene({ nodes, edges, palette });
  const inside = scene.items.every((i) => i.kind === 'line'
    ? [i.x1, i.x2].every((v) => v >= 0 && v <= SLIDE_W) && [i.y1, i.y2].every((v) => v >= 0 && v <= SLIDE_H)
    : i.x >= 0 && i.y >= 0 && i.x + i.w <= SLIDE_W + 1e-9 && i.y + i.h <= SLIDE_H + 1e-9);
  check('everything fits on the slide', inside, scene.items);
  check('diamond maps to a diamond preset', shapes(scene.items).some((s) => s.preset === 'diamond'));
  const flipped = shapes(scene.items).find((s) => s.flipV);
  check('a vertically flipped shape keeps its text in a separate box', !!flipped && !flipped.text && scene.items.some((i) => i.kind === 'text' && i.text.value === 'flipped'), flipped);
  const [edge] = lines(scene.items);
  check('edge runs between facing sides with an arrowhead at the target', edge.end && !edge.begin && edge.x1 < edge.x2, edge);
  check('edge label is on the slide', texts(scene.items).includes('go'));
  check('the diagram is centred', Math.abs(Math.min(...scene.items.flatMap((i) => (i.kind === 'line' ? [i.x1, i.x2] : [i.x]))) - (SLIDE_W - (Math.max(...scene.items.flatMap((i) => (i.kind === 'line' ? [i.x1, i.x2] : [i.x + i.w]))))) ) < 0.01);
  check('background is the paper colour', scene.background === palette.bg);
}

{
  // G is open: a sheet wraps x and y, and the group has no card of its own
  const nodes = [N('A', null, 0, 0), N('G', null, 0, 0), N('x', 'G', 200, 100), N('y', 'G', 200, 200)];
  const scene = buildScene({ nodes, edges: [E('1', 'A', 'x'), E('2', 'G', 'x')], palette });
  const sheet = shapes(scene.items).find((s) => s.preset === 'roundRect' && s.text?.value === 'G');
  check('an open group is a titled sheet', !!sheet && sheet.text?.valign === 'top', sheet);
  check('the sheet is drawn before the nodes', scene.items.indexOf(sheet!) === 0);
  check('an edge between a group and its own child waits', lines(scene.items).length === 1, lines(scene.items));
  check('the group has no card', shapes(scene.items).filter((s) => s.text?.value === 'G').length === 1);
}

{
  // G is folded: one card with a paper stack, and creases replace the edges into it
  const nodes = [N('A', null, 0, 0), N('B', null, 0, 400), N('G', null, 0, 0, { collapsed: true }), N('x', 'G', 200, 150), N('y', 'G', 200, 250)];
  const scene = buildScene({ nodes, edges: [E('1', 'A', 'x'), E('2', 'y', 'B', { label: 'out' })], palette });
  const cards = shapes(scene.items).filter((s) => s.text?.value === 'G');
  check('a folded group is one card', cards.length === 1, cards);
  check('the contents are not drawn', !texts(scene.items).includes('x') && !texts(scene.items).includes('y'));
  check('the card sits on a stack', shapes(scene.items).filter((s) => !s.text && s.preset === 'rect').length === 1);
  check('creases join the card to its neighbours', lines(scene.items).length === 2, lines(scene.items));
  check('a single folded edge keeps its label', texts(scene.items).includes('out'));
}

{
  // icon and image nodes: tile, picture and a separate label
  const nodes = [
    N('db', null, 0, 0, { icon: 'lucide:database', shape: 'round' }),
    N('pic', null, 300, 0, { image: { src: 'data:image/png;base64,AAAA', w: 60, h: 40, pos: 't' } }),
  ];
  const scene = buildScene({ nodes, edges: [], palette });
  const images = scene.items.filter((i) => i.kind === 'image');
  check('an icon node and an image node each add a picture', images.length === 2 && images.some((i) => i.icon === 'lucide:database') && images.some((i) => i.src?.startsWith('data:image/png')), images);
  check('tile labels are text boxes', scene.items.filter((i) => i.kind === 'text').length === 2);
}

{
  // fonts shrink with the diagram, but never below the floor
  const wide = Array.from({ length: 40 }, (_, i) => N(`n${i}`, null, i * 400, 0));
  const scene = buildScene({ nodes: wide, edges: [], palette });
  const sizes = shapes(scene.items).map((s) => s.text!.size);
  check('fonts stay readable', sizes.every((s) => s >= 6), sizes);
}

{
  let message = '';
  try { buildScene({ nodes: [], edges: [], palette }); } catch (e) { message = (e as Error).message; }
  check('an empty diagram is rejected', /Add diagram nodes/.test(message), message);
}

if (failed) process.exit(1);
console.log('PASS: powerpoint scene mapping, groups, edges and fit');
