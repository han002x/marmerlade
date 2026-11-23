// PowerPoint file check: the scene is written as one slide of native shapes,
// connectors and pictures inside a valid .pptx.
// Run with: node --experimental-strip-types scripts/pptx.ts [out.pptx]
import { writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { buildScene, type Palette, type Scene } from '../src/pptx/scene.ts';
import { writePptx } from '../src/pptx/write.ts';
import type { DiagramEdge, DiagramNode } from '../src/types.ts';

const palette: Palette = { bg: '#fbf7ee', ink: '#2a2723', node: '#ffffff', group: '#f1ead9', text: '#2a2723', border: '#b9ae96', font: 'Inter' };
const N = (id: string, parentId: string | null, x = 0, y = 0, extra: Partial<DiagramNode> = {}): DiagramNode =>
  ({ id, label: id, shape: 'rect', parentId, collapsed: false, position: { x, y }, ...extra });
const E = (id: string, source: string, target: string, extra: Partial<DiagramEdge> = {}): DiagramEdge => ({ id, source, target, ...extra });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) { failed++; console.error(`FAIL: ${name}`, detail ?? ''); }
};
const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

const nodes = [
  N('Client', null, 0, 0),
  N('Plan', null, 300, 0, { shape: 'diamond' }),
  N('Store', null, 0, 200, { shape: 'cylinder' }),
  N('Flip', null, 300, 200, { shape: 'trap-t' }),
  N('G', null, 0, 0, { collapsed: true }), N('x', 'G', 600, 0), N('y', 'G', 600, 100),
  N('Logo', null, 900, 0, { image: { src: PNG, w: 40, h: 40 } }),
];
const edges = [
  E('1', 'Client', 'Plan', { label: 'ask', style: { arrowheads: 'end' } }),
  E('2', 'Plan', 'Store', { style: { arrowheads: 'both' } }),
  E('3', 'Plan', 'x'),
];
const scene = buildScene({ nodes, edges, palette });
const bytes = await writePptx(scene, 'Check');
const zip = await JSZip.loadAsync(bytes);
const names = Object.keys(zip.files);
const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
const core = await zip.file('docProps/core.xml')!.async('string');

check('one slide', names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length === 1, names);
check('a valid presentation part', names.includes('[Content_Types].xml') && names.includes('ppt/presentation.xml'));
check('presets are native', ['diamond', 'can', 'trapezoid', 'rect'].every((p) => slide.includes(`prst="${p}"`)), slide.slice(0, 400));
check('one connector per edge', count(slide, /prst="line"/g) === 3, count(slide, /prst="line"/g));
check('arrowheads follow the edge style', count(slide, /<a:tailEnd type="triangle"/g) === 2 && count(slide, /<a:headEnd type="triangle"/g) === 1);
check('text stays editable', ['Client', 'Plan', 'ask', 'Flip'].every((t) => slide.includes(`>${t}<`)));
check('the folded group is a card; its contents are not drawn', slide.includes('>G<') && !slide.includes('>x<') && !slide.includes('>y<'));
check('a flipped shape is flipped', slide.includes('flipV="1"'));
check('the image is embedded', names.some((n) => n.startsWith('ppt/media/')) && slide.includes('<p:pic>'));
check('the slide has a paper background', slide.includes('FBF7EE') || (await zip.file('ppt/slideMasters/slideMaster1.xml')!.async('string')).includes('FBF7EE') || slide.includes('fbf7ee'));
check('the title is set', core.includes('Check'), core);

{
  // a picture that never loaded is dropped; the rest of the slide still writes
  const partial: Scene = { ...scene, items: [...scene.items, { kind: 'image', icon: 'lucide:user', x: 1, y: 1, w: 1, h: 1 }] };
  const zip2 = await JSZip.loadAsync(await writePptx(partial));
  const xml = await zip2.file('ppt/slides/slide1.xml')!.async('string');
  check('an unresolved icon is skipped', count(xml, /<p:pic>/g) === 1, count(xml, /<p:pic>/g));
}

const out = process.argv[2];
if (out) { writeFileSync(out, bytes); console.log(`wrote ${out}`); }
if (failed) process.exit(1);
console.log('PASS: powerpoint file has native shapes, connectors and pictures');
