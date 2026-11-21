// Run against a build or a clean installed package: node scripts/native-integration.mjs [CLI path].
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from 'playwright';
import { parse } from 'smol-toml';

const run = promisify(execFile);
const cli = resolve(process.argv[2] ?? 'dist/cli.js');
const directory = await mkdtemp(join(tmpdir(), 'marmerlade-native-check-'));
const project = join(directory, 'project with spaces');
const file = join(project, 'workspace.marmerlade.json');
let client;
let browser;

async function connect() {
  client = new Client({ name: 'native-integration', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, '--file', file], stderr: 'pipe' });
  await client.connect(transport);
}
async function call(name, args = {}) {
  const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
  const text = response.content.find(content => content.type === 'text');
  assert(text, 'Tool must return metadata');
  const data = JSON.parse(text.text);
  assert(!response.isError, `${name}: ${JSON.stringify(data)}`);
  return { data, content: response.content };
}
async function rejects(name, args) {
  const response = await client.callTool({ name, arguments: args });
  assert.equal(response.isError, true, `${name} should reject this request`);
}
function gifFrames(data) {
  assert(['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString()));
  let offset = 13 + (data[10] & 128 ? 3 * 2 ** ((data[10] & 7) + 1) : 0);
  let frames = 0;
  const blocks = () => { while (data[offset]) offset += data[offset] + 1; offset++; };
  while (offset < data.length) {
    const marker = data[offset++];
    if (marker === 0x3b) break;
    if (marker === 0x21) { offset++; blocks(); }
    else if (marker === 0x2c) {
      const flags = data[offset + 8]; offset += 9;
      if (flags & 128) offset += 3 * 2 ** ((flags & 7) + 1);
      offset++; blocks(); frames++;
    } else throw new Error(`Invalid GIF block at ${offset}`);
  }
  return frames;
}
try {
  await mkdir(join(project, '.codex'), { recursive: true });
  await mkdir(join(project, '.kiro/settings'), { recursive: true });
  const codex = join(project, '.codex/config.toml');
  const kiro = join(project, '.kiro/settings/mcp.json');
  await writeFile(codex, 'model = "preserved"\n[mcp_servers.other]\ncommand = "other-server"\n');
  await writeFile(kiro, JSON.stringify({ mcpServers: { other: { command: 'other-server' } }, preserved: true }));
  await assert.rejects(run(process.execPath, [cli, 'doctor', '--file', file], { env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(directory, 'missing-browser') } }), error => {
    const report = JSON.parse(error.stdout);
    const browser = report.checks.find(check => check.name === 'chromium');
    assert.equal(report.ready, false);
    assert.equal(browser.status, 'missing');
    assert.equal(browser.fix.args.at(-1), 'chromium');
    assert(existsSync(browser.fix.args[0]));
    return true;
  });
  const setupArgs = [cli, 'setup', '--project', project, '--host', 'both', '--file', file, '--no-browser'];
  const first = JSON.parse((await run(process.execPath, setupArgs)).stdout);
  assert.equal(first.runtime.ready, true);
  const configured = await readFile(codex, 'utf8');
  assert.equal(parse(configured).model, 'preserved');
  assert.equal(parse(configured).mcp_servers.other.command, 'other-server');
  assert.equal(JSON.parse(await readFile(kiro, 'utf8')).preserved, true);
  const second = JSON.parse((await run(process.execPath, setupArgs)).stdout);
  assert.deepEqual(second.configured, []);
  assert.equal(await readFile(codex, 'utf8'), configured);
  assert((await readFile(codex + '.marmerlade-backup', 'utf8')).includes('other-server'));
  const skillNames = ['marmerlade-director', 'marmerlade-codebase-map', 'marmerlade-docs', 'marmerlade-setup'];
  for (const host of ['claude', 'cursor']) await run(process.execPath, [cli, 'setup', '--project', project, '--host', host, '--file', file, '--no-browser']);
  for (const host of ['.agents/skills', '.kiro/skills', '.claude/skills', '.cursor/skills']) for (const name of skillNames) assert((await readFile(join(project, host, name, 'SKILL.md'), 'utf8')).startsWith('---'));
  await assert.rejects(run(process.execPath, [...setupArgs, '--file', join(project, 'different.json')]), /already has a different/);
  assert.equal(await readFile(codex, 'utf8'), configured);
  await writeFile(file, 'invalid workspace JSON');
  await assert.rejects(run(process.execPath, [cli, 'doctor', '--file', file]), error => {
    assert.equal(JSON.parse(error.stdout).checks.find(check => check.name === 'workspace').status, 'missing');
    return true;
  });
  await rm(file);
  await connect();
  const environment = (await call('diagnose_environment')).data;
  assert.equal(environment.ready, true);
  assert.equal(environment.imageGeneration.status, 'host-managed');
  await assert.rejects(run(process.execPath, [cli, 'doctor', '--file', file]), error => {
    assert.equal(JSON.parse(error.stdout).checks.find(check => check.name === 'workspace-lock').status, 'busy');
    return true;
  });
  assert.equal((await call('list_icons', { query: 'kiro' })).data.icons[0].id, 'logos:kiro');
  const empty = (await call('render_preview', { revision: 0 })).data;
  assert.deepEqual(empty.diagnostics.visibleNodes, [], 'Empty preview must not seed the sample diagram');
  const node = (id, label, parentId = null, collapsed = false) => ({ id, label, parentId, collapsed, shape: 'round', position: { x: 0, y: 0 }, style: { animation: 'pulse', animationSpeed: 0.8, fontFamily: 'sans' } });
  let state = (await call('apply_changes', { revision: 0, changes: [
    { kind: 'put_page', document: { id: 'notes', title: 'Design notes', body: '# Design notes\n\nA grounded explanation.' } },
    { kind: 'put_deck', document: { id: 'deck', title: 'Architecture', body: '# Architecture\n\nA main message.\n\n---\n\n# Next step' } },
    ...[node('client', 'Customer request'), { ...node('platform', 'Platform', null, true), pageIds: ['notes'], deckIds: ['deck'] }, { ...node('kiro', 'Kiro agent', 'platform'), icon: 'logos:kiro' }, node('search', 'Search sources', 'platform', true), node('database', 'Long descriptive database label', 'search'), node('cache', 'Cache', 'search')].map(node => ({ kind: 'put_node', node })),
    ...[['client', 'kiro'], ['kiro', 'database'], ['database', 'cache']].map(([source, target], index) => ({ kind: 'put_edge', edge: { id: `edge${index}`, source, target, style: { animation: 'flow', animationSpeed: 0.8 } } })),
  ] })).data;
  const badLayout = (await call('render_preview', { revision: state.revision, fold: 'expanded' })).data;
  assert(badLayout.diagnostics.overlaps.length > 0, 'Actual overlaps must be reported');
  state = (await call('layout_diagram', { revision: state.revision })).data;
  assert.equal(state.diagram.nodes.find(node => node.id === 'platform').collapsed, true);
  assert.equal(state.diagram.nodes.find(node => node.id === 'search').collapsed, true);
  for (const fold of ['current', 'expanded', 'collapsed']) {
    const preview = await call('render_preview', { revision: state.revision, fold, appearance: 'halloween' });
    assert(preview.content.some(content => content.type === 'image'));
    assert.deepEqual(preview.data.diagnostics.overlaps, [], `${fold} layout overlaps`);
    assert.deepEqual(preview.data.diagnostics.clipped, []);
    assert.deepEqual(preview.data.diagnostics.errors, []);
    const png = await readFile(preview.data.file);
    assert.equal(png.readUInt32BE(16), 1440);
    assert.equal(png.readUInt32BE(20), 1000);
  }
  for (const [view, id] of [['wiki', 'notes'], ['slides', 'deck']]) {
    const preview = (await call('render_preview', { revision: state.revision, view, id })).data;
    assert.deepEqual(preview.diagnostics.errors, []);
    assert.equal(preview.diagnostics.contentOverflow, false);
  }
  assert.deepEqual((await call('get_workspace')).data.diagram, state.diagram, 'Previews cannot save isolated view state');
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 64, height: 32 } });
  await page.setContent('<body style="margin:0;background:#ff963f"></body>');
  const original = await page.screenshot();
  const slideBody = transition => `---\nbackgroundColor: '#000000'\ncolor: '#00ff00'\nfont: sans\nheadingFont: sans\ntransition: ${transition}\n---\n\n# Visible slide\n\nThe preview must capture fully visible text.`;
  const greenPixels = async file => page.evaluate(async src => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 24 && pixels[i + 1] > 230 && pixels[i + 2] < 24) count++;
    return count;
  }, `data:image/png;base64,${(await readFile(file)).toString('base64')}`);
  state = (await call('apply_changes', { revision: state.revision, changes: [{ kind: 'put_deck', document: { id: 'transition', title: 'Transition preview', body: slideBody('none') } }] })).data;
  const staticSlide = (await call('render_preview', { revision: state.revision, view: 'slides', id: 'transition' })).data;
  const expectedGreen = await greenPixels(staticSlide.file);
  assert(expectedGreen > 1000, 'Reference slide must have visible green text');
  state = (await call('apply_changes', { revision: state.revision, changes: [{ kind: 'put_deck', document: { id: 'transition', title: 'Transition preview', body: slideBody('fade') } }] })).data;
  for (let capture = 0; capture < 4; capture++) {
    const animatedSlide = (await call('render_preview', { revision: state.revision, view: 'slides', id: 'transition' })).data;
    assert((await greenPixels(animatedSlide.file)) >= expectedGreen * 0.98, 'Slide preview must finish its entrance animation before capture');
  }
  await mkdir(join(project, 'assets'));
  await writeFile(join(project, 'assets/generated.png'), original);
  await browser.close(); browser = undefined;
  const imported = (await call('import_image', { revision: state.revision, nodeId: 'cache', path: 'assets/generated.png' })).data;
  assert.equal(imported.image.w, 64); assert.equal(imported.image.h, 32);
  assert.deepEqual(await readFile(join(project, 'assets/generated.png')), original);
  state = (await call('get_workspace')).data;
  assert.match(state.diagram.nodes.find(node => node.id === 'cache').image.src, /^data:image\/webp;base64,/);
  await writeFile(join(project, 'assets/broken.svg'), '<not-an-svg>');
  await rejects('import_image', { revision: state.revision, nodeId: 'cache', path: 'assets/broken.svg' });
  assert.equal((await call('get_workspace')).data.revision, state.revision);
  await writeFile(join(directory, 'outside.png'), original);
  await rejects('import_image', { revision: state.revision, nodeId: 'cache', path: '../outside.png' });
  if (process.platform !== 'win32') {
    await symlink(join(directory, 'outside.png'), join(project, 'assets/escape.png'));
    await rejects('import_image', { revision: state.revision, nodeId: 'cache', path: 'assets/escape.png' });
  }
  const imagePreview = (await call('render_preview', { revision: state.revision, fold: 'expanded' })).data;
  assert.deepEqual(imagePreview.diagnostics.failedImages, []);
  await rejects('render_preview', { revision: 0 });
  await rejects('render_preview', { revision: state.revision, view: 'wiki', id: 'missing' });
  const job = (await call('export_gif', { revision: state.revision, fps: 4, maxWidth: 320, fold: 'expanded' })).data;
  const recordedRevision = state.revision;
  await call('apply_changes', { revision: state.revision, changes: [{ kind: 'put_page', document: { id: 'notes', title: 'Design notes', body: '# Newer revision during export' } }] });
  let result;
  const deadline = Date.now() + 60_000;
  do {
    result = (await call('get_render_job', { jobId: job.jobId })).data;
    if (result.status === 'complete' || result.status === 'failed') break;
    await new Promise(resolve => setTimeout(resolve, 200));
  } while (Date.now() < deadline);
  assert.equal(result.status, 'complete', JSON.stringify(result));
  assert.equal(result.revision, recordedRevision);
  assert(gifFrames(await readFile(result.file)) >= 2, 'Native GIF must contain multiple image frames');
  await rejects('get_render_job', { jobId: randomUUID() });
  state = (await call('get_workspace')).data;
  const clientNode = state.diagram.nodes.find(node => node.id === 'client');
  state = (await call('apply_changes', { revision: state.revision, changes: [{ kind: 'put_node', node: { ...clientNode, style: { animation: 'pulse', animationSpeed: 31 } } }] })).data;
  const invalid = (await call('export_gif', { revision: state.revision, fps: 4, maxWidth: 320 })).data;
  const failureDeadline = Date.now() + 30_000;
  do {
    result = (await call('get_render_job', { jobId: invalid.jobId })).data;
    if (result.status === 'failed' || result.status === 'complete') break;
    await new Promise(resolve => setTimeout(resolve, 200));
  } while (Date.now() < failureDeadline);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /30 second export limit/);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.version, 3);
  const embedded = saved.diagram.nodes.find(node => node.id === 'cache').image.src;
  await client.close(); client = undefined;
  await connect();
  assert.equal((await call('get_workspace')).data.diagram.nodes.find(node => node.id === 'cache').image.src, embedded);
  await rejects('get_render_job', { jobId: job.jobId });
  console.log('PASS: idempotent setup and preserved configuration, diagnostics, icons, measured layouts, isolated previews, image import and path boundaries, native GIF jobs, revisions and restart persistence');
} finally { await browser?.close(); await client?.close(); await rm(directory, { recursive: true, force: true }); }
