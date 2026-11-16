#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import open from 'open';
import { changeSchema, parseDiagram } from '../src/workspaceSchema.ts';
import { applyChanges, openWorkspace } from './workspace.ts';
import { serveWorkspace } from './http.ts';
import { mergeDiagram, parseMermaid, toMermaid } from '../src/mermaid/io.ts';
import { layout } from '../src/layout.ts';
import { createRenderer } from './renderer.ts';
import { diagnoseEnvironment } from './environment.ts';
import { setupProject } from './setup.ts';
import { previewRequestSchema, gifRequestSchema } from '../src/renderContract.ts';
import { ICONS } from '../src/icons/catalog.ts';

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    file: { type: 'string', default: './diagram.marmerlade.json' }, help: { type: 'boolean' }, version: { type: 'boolean' },
    project: { type: 'string', default: '.' }, host: { type: 'string', default: 'both' }, name: { type: 'string', default: 'marmerlade' },
    'no-browser': { type: 'boolean', default: false }, replace: { type: 'boolean', default: false }, open: { type: 'boolean', default: false },
  } });
  if (values.help || values.version) {
    process.stderr.write(values.version ? '0.1.0\n' : 'Usage: marmerlade [--file ./diagram.marmerlade.json]\n       marmerlade doctor [--file path]\n       marmerlade setup --project directory --host codex|kiro|both [--file path] [--no-browser] [--replace]\n       marmerlade serve --file path [--open]\nDefault starts MCP over stdio and serves a live canvas on localhost.\n'); return;
  }
  if (positionals[0] === 'doctor') {
    const report = await diagnoseEnvironment(values.file);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (!report.ready) process.exitCode = 1;
    return;
  }
  if (positionals[0] === 'setup') {
    const host = z.enum(['codex', 'kiro', 'both']).parse(values.host);
    const report = await setupProject({ project: values.project, file: values.file, host, name: values.name, browser: !values['no-browser'], replace: values.replace });
    process.stdout.write(JSON.stringify(report, null, 2) + '\n'); return;
  }
  if (positionals.length && positionals[0] !== 'serve') throw new Error('Unknown command. Use --help.');
  const workspace = await openWorkspace(values.file);
  let http: Awaited<ReturnType<typeof serveWorkspace>>;
  try { http = await serveWorkspace(workspace); } catch (error) { await workspace.close(); throw error; }
  const renderer = createRenderer(workspace, http.url);
  const server = new McpServer({ name: 'marmerlade', version: '0.1.0' });
  const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
  const tool = (fn: () => unknown | Promise<unknown>) => Promise.resolve().then(fn).then(result).catch((error: unknown) => ({ ...result({ error: error instanceof Error ? error.message : String(error) }), isError: true }));
  server.registerTool('get_workspace', { description: 'Read the diagram, wiki pages, slide decks, current revision, file and live canvas URL.' }, () => tool(() => ({ ...workspace.snapshot(), file: workspace.file, url: http.url })));
  server.registerTool('apply_changes', {
    description: 'Atomically edit a workspace. Read its revision first. put operations replace the entity with that ID; delete_node removes its subtree and incident edges, retaining documents. Document deletions unlink every node. Include all related changes in one batch.',
    inputSchema: { revision: z.number().int().nonnegative(), changes: z.array(changeSchema).min(1) },
  }, ({ revision, changes }) => tool(() => workspace.commit(revision, d => applyChanges(d, changes))));
  server.registerTool('import_mermaid', {
    description: 'Replace diagram structure from a Mermaid flowchart, preserving existing content and styling by ID. New document references create empty pages/decks. Optional tidy repositions nodes.',
    inputSchema: { revision: z.number().int().nonnegative(), source: z.string(), tidy: z.boolean().default(true) },
  }, ({ revision, source, tidy }) => tool(() => workspace.commit(revision, current => {
    const parsed = parseMermaid(source); if (!parsed.ok) throw new Error(parsed.error);
    const d = { ...mergeDiagram(parsed.diagram, current), pages: current.pages ?? [], decks: current.decks ?? [] };
    for (const [key, list] of [['pageIds', d.pages], ['deckIds', d.decks]] as const) {
      for (const node of d.nodes) for (const id of node[key] ?? []) if (!list.some(doc => doc.id === id)) list.push({ id, title: node.label, body: '', updatedAt: Date.now() });
    }
    parseDiagram(d);
    if (tidy) { const positions = layout(d.nodes, d.edges); d.nodes = d.nodes.map(n => ({ ...n, position: positions[n.id] ?? n.position })); }
    return d;
  })));
  server.registerTool('export_mermaid', { description: 'Export diagram structure as Mermaid. Use get_workspace for lossless content.' }, () => tool(() => ({ source: toMermaid(workspace.snapshot().diagram) })));
  server.registerTool('diagnose_environment', {
    description: 'Check Node, packaged app, project access, and Chromium. Image generation belongs to the host agent, not this server.',
    inputSchema: { probe: z.boolean().default(true) },
  }, ({ probe }) => tool(() => diagnoseEnvironment(workspace.file, { probe, ownsWorkspace: true })));
  server.registerTool('list_icons', {
    description: 'Find supported icon IDs and names. Use these IDs rather than guessing Iconify names.',
    inputSchema: { query: z.string().default(''), group: z.enum(['tech', 'ai', 'brand']).optional(), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(50) },
  }, ({ query, group, offset, limit }) => tool(() => {
    const matches = ICONS.filter(icon => (!group || icon.group === group) && `${icon.id} ${icon.name}`.toLowerCase().includes(query.toLowerCase()));
    return { icons: matches.slice(offset, offset + limit).map(({ id, name, group }) => ({ id, name, group })), total: matches.length, nextOffset: offset + limit < matches.length ? offset + limit : null };
  }));
  server.registerTool('import_image', {
    description: 'Normalize a project-local image and attach it to an existing node. Original files are preserved. Paths must be inside the workspace project directory. Read revision first.',
    inputSchema: { revision: z.number().int().nonnegative(), nodeId: z.string().min(1), path: z.string().min(1) },
  }, ({ revision, nodeId, path }) => tool(() => renderer.importImage(revision, nodeId, path)));
  server.registerTool('layout_diagram', {
    description: 'Measure rendered labels and arrange the expanded graph. Saves positions while preserving fold state, styling, and documents. Read revision first; inspect previews afterwards.',
    inputSchema: { revision: z.number().int().nonnegative(), direction: z.enum(['TB', 'LR']).default('TB') },
  }, ({ revision, direction }) => tool(() => renderer.layout(revision, direction)));
  server.registerTool('render_preview', {
    description: 'Render an isolated revision of the actual app as PNG with overlap, clipping, image-load, slide-overflow and browser-error diagnostics. Does not change the live workspace.',
    inputSchema: previewRequestSchema.shape,
  }, async ({ revision, ...options }) => {
    try {
      const preview = await renderer.preview(revision, options);
      return { content: [...result(preview).content, { type: 'image' as const, data: (await readFile(preview.file)).toString('base64'), mimeType: 'image/png' }] };
    } catch (error) { return { ...result({ error: error instanceof Error ? error.message : String(error) }), isError: true }; }
  });
  server.registerTool('export_gif', {
    description: 'Start native animated-GIF export from an isolated revision. Returns a job ID immediately; poll get_render_job for progress and the local output file. Does not change the workspace.',
    inputSchema: gifRequestSchema.shape,
  }, ({ revision, fps, maxWidth, flow, ...options }) => tool(() => renderer.exportGif(revision, options, { fps, maxWidth, flow })));
  server.registerTool('get_render_job', {
    description: 'Read an asynchronous render job: queued, running with progress, complete with file, or failed with an error. Job IDs belong to this server session.',
    inputSchema: { jobId: z.string().uuid() },
  }, ({ jobId }) => tool(() => renderer.job(jobId)));
  server.registerTool('open_workspace', {
    description: 'Open the live browser canvas, or a node, wiki page, or slide deck.',
    inputSchema: { view: z.enum(['canvas', 'node', 'wiki', 'slides']).default('canvas'), id: z.string().optional() },
  }, ({ view, id }) => tool(async () => {
    if (view === 'node' && !id) throw new Error('Node view requires an id');
    const url = `${http.url}/#/${view === 'canvas' ? '' : view}${id ? '/' + encodeURIComponent(id) : ''}`;
    try { await open(url); return { url, opened: true }; }
    catch (error) { return { url, opened: false, error: error instanceof Error ? error.message : String(error) }; }
  }));
  for (const [name, filename] of [['guide', 'guide.md'], ['example', 'example.marmerlade.json']] as const) {
    server.registerResource(name, `marmerlade://${name}`, { description: name === 'guide' ? 'Document model, editing rules, wiki and slides syntax' : 'Complete example with diagram, wiki pages and slides', mimeType: name === 'guide' ? 'text/markdown' : 'application/json' }, async uri => ({ contents: [{ uri: uri.href, text: await readFile(new URL(`./${filename}`, import.meta.url), 'utf8') }] }));
  }
  let closing = false;
  async function close() { if (closing) return; closing = true; await renderer.close(); await server.close(); await http.close(); await workspace.close(); }
  process.once('SIGINT', () => { void close(); }); process.once('SIGTERM', () => { void close(); });
  if (positionals[0] !== 'serve') {
    process.stdin.once('end', () => { void close(); });
    try { await server.connect(new StdioServerTransport()); } catch (error) { await close(); throw error; }
  }
  if (values.open) { try { await open(http.url); } catch { process.stderr.write(`Open ${http.url} in your browser.\n`); } }
  process.stderr.write(`Marmerlade: ${http.url}\nWorkspace: ${workspace.file}\n`);
}
main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
