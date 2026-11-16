import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDiagram } from '/home/han/projects/merfolk/src/workspaceSchema.ts';
import { parseMermaid } from '/home/han/projects/merfolk/src/mermaid/io.ts';
import { splitSlides } from '/home/han/projects/merfolk/src/slides.ts';

const project = dirname(fileURLToPath(import.meta.url));
const agent = resolve(project, '../agent');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = data => createHash('sha256').update(data).digest('hex');
const evidence = await readJson(resolve(agent, 'acceptance-evidence.json'));
const raw = await readJson(evidence.final.file);
assert.equal(raw.version, 3);
const diagram = parseDiagram(raw.diagram);
const canonical = values => [...values].sort((a, b) => a.id.localeCompare(b.id));
for (const kind of ['nodes', 'edges', 'pages', 'decks']) {
  assert.deepEqual(canonical(diagram[kind]), canonical(evidence.initial.diagram[kind]), kind + ' changed');
  assert.deepEqual(canonical(diagram[kind]), canonical(evidence.final.diagram[kind]), kind + ' differs from MCP');
}
assert.equal(diagram.nodes.length, 26);
assert.equal(diagram.edges.length, 18);
assert.equal(diagram.pages.length, 8);
assert.equal(diagram.decks.length, 1);
const slides = splitSlides(diagram.decks[0].body).slides;
assert.equal(slides.length, 5);
const titles = diagram.pages.map(page => page.title.trim().toLowerCase());
assert.equal(new Set(titles).size, titles.length);
let wikiLinks = 0;
let embeds = 0;
const citations = new Map();
const sourceReport = { id: 'source-grounding-report', body: await readFile(resolve(agent, 'source-grounding-report.md'), 'utf8') };
for (const doc of [...diagram.pages, ...diagram.decks, sourceReport]) {
  for (const match of doc.body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    const target = match[1].trim().toLowerCase();
    assert.ok(titles.includes(target) || diagram.nodes.some(n => n.label.trim().toLowerCase() === target), 'Unresolved link: ' + target);
    wikiLinks++;
  }
  for (const match of doc.body.matchAll(/\{\{diagram:([^}]+)\}\}/g)) {
    assert.ok(diagram.nodes.some(n => n.id === match[1] || n.label === match[1]), 'Unresolved embed');
    embeds++;
  }
  for (const match of doc.body.matchAll(/\]\((\/home\/han\/projects\/xray\/[^)\n]+):(\d+)\)/g)) {
    const path = match[1];
    const line = Number(match[2]);
    const source = await readFile(path, 'utf8');
    assert.ok(line >= 1 && line <= source.split('\n').length, 'Bad citation line: ' + path);
    const entry = citations.get(path) ?? { file: path, sha256: hash(source), lines: [], documents: [] };
    if (!entry.lines.includes(line)) entry.lines.push(line);
    if (!entry.documents.includes(doc.id)) entry.documents.push(doc.id);
    citations.set(path, entry);
  }
}
assert.equal(embeds, 1);
const mermaidFile = resolve(project, 'marmerlade-output/xray-dir.mmd');
const mermaid = parseMermaid(await readFile(mermaidFile, 'utf8'));
assert.equal(mermaid.ok, true, mermaid.error);
assert.equal(mermaid.diagram.nodes.length, 26);
assert.equal(mermaid.diagram.edges.length, 18);
for (const node of diagram.nodes) {
  const exported = mermaid.diagram.nodes.find(n => n.id === node.id);
  assert.ok(exported, 'Missing exported node: ' + node.id);
  for (const key of ['label', 'parentId']) assert.deepEqual(exported[key], node[key]);
  for (const key of ['pageIds', 'deckIds']) assert.deepEqual(exported[key] ?? [], node[key] ?? []);
}
const triples = edges => edges.map(e => JSON.stringify([e.source, e.target, e.label ?? ''])).sort();
assert.deepEqual(triples(mermaid.diagram.edges), triples(diagram.edges));
const imageFile = resolve(project, 'assets/xray-public-globe.svg');
const sourceImage = '/home/han/projects/xray/xray-web/public/globe.svg';
const image = await readFile(imageFile);
assert.deepEqual(image, await readFile(sourceImage));
const area = diagram.nodes.find(n => n.id === 'area');
assert.ok(area.image.src.startsWith('data:image/svg+xml;base64,'));
assert.deepEqual(Buffer.from(area.image.src.split(',')[1], 'base64'), image);
const files = [];
for (const preview of evidence.previews) {
  const diagnostics = preview.diagnostics;
  for (const key of ['overlaps', 'clipped', 'smallLabels', 'failedImages', 'errors']) {
    assert.deepEqual(diagnostics[key], [], preview.name + ': ' + key);
  }
  assert.equal(diagnostics.contentOverflow, false, preview.name);
  const bytes = await readFile(preview.file);
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Invalid PNG');
  files.push({ name: preview.name, file: preview.file, bytes: bytes.length, sha256: hash(bytes) });
}
assert.equal(files.length, 18);
const gif = evidence.gif_attempts.at(-1).job;
assert.equal(gif.status, 'complete');
const gifBytes = await readFile(gif.file);
assert.equal(gifBytes.length, gif.bytes);
assert.ok(gifBytes.subarray(0, 3).toString() === 'GIF');
const gifInspection = await readJson(resolve(agent, 'final-gif-inspection.json'));
assert.deepEqual(gifInspection.size, [1200, 1200]);
assert.equal(gifInspection.frames, 28);
assert.equal(gifInspection.duration_ms, 7000);
assert.equal(gifInspection.loop, 0);
assert.ok(gifInspection.distinct_frames > 1);
const output = {
  passed: true,
  counts: { nodes: 26, edges: 18, pages: 8, decks: 1, slides: slides.length, wikiLinks, embeds, previews: files.length },
  stable_ids_and_content_preserved: true,
  saved_file_matches_mcp: true,
  workspace: { file: evidence.final.file, sha256: hash(await readFile(evidence.final.file)) },
  source_citations: [...citations.values()],
  original_image: { file: imageFile, source: sourceImage, bytes: image.length, sha256: hash(image), identical_to_source_and_embedded_image: true },
  mermaid: { file: mermaidFile, sha256: hash(await readFile(mermaidFile)), parsed_with_runtime_parser: true, structure_and_document_references_match: true },
  previews: files,
  gif: { ...gifInspection, sha256: hash(gifBytes) }
};
await writeFile(resolve(agent, 'verification-results.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, counts: output.counts, image_retained: true, mermaid_matches: true, stable_content: true }));
