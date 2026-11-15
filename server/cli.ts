#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import open from 'open';
import { changeSchema, parseDiagram } from '../src/workspaceSchema.ts';
import { applyChanges, openWorkspace } from './workspace.ts';
import { serveWorkspace } from './http.ts';
import { mergeDiagram, parseMermaid, toMermaid } from '../src/mermaid/io.ts';
import { layout } from '../src/layout.ts';
import { briefInputSchema } from '../src/briefSchema.ts';
import { inspectRepository, readRepositoryFile } from './repository.ts';
import { setup } from './setup.ts';

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    file: { type: 'string', default: './diagram.marmerlade.json' }, repo: { type: 'string', default: process.cwd() },
    help: { type: 'boolean' }, version: { type: 'boolean' }, client: { type: 'string' },
    'dry-run': { type: 'boolean' }, remove: { type: 'boolean' }, port: { type: 'string' }, 'no-open': { type: 'boolean' },
  } });
  if (values.help || values.version) {
    process.stderr.write(values.version ? '0.1.0\n' : 'Usage: marmerlade [--file ./diagram.marmerlade.json] [--repo ./project]\n       marmerlade setup --client codex|claude-code|kiro [--repo .] [--file ./diagram.marmerlade.json] [--dry-run|--remove]\n       marmerlade preview [--file ./diagram.marmerlade.json] [--port 5173] [--no-open]\nSetup registers project-scoped MCP tools and a workflow skill. Default mode starts MCP over stdio and a live canvas on localhost.\n'); return;
  }
  const command = positionals[0];
  if (positionals.length > 1 || (command && !['setup', 'preview'].includes(command))) throw new Error('Unknown command. Run marmerlade --help.');
  if (command === 'setup') {
    process.stdout.write(JSON.stringify(await setup({ client: values.client, repository: values.repo, file: values.file, cli: fileURLToPath(import.meta.url), dryRun: values['dry-run'], remove: values.remove }), null, 2) + '\n'); return;
  }
  const port = values.port === undefined ? undefined : Number(values.port);
  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) throw new Error('Port must be an integer between 0 and 65535.');
  const workspace = await openWorkspace(values.file);
  let http: Awaited<ReturnType<typeof serveWorkspace>>;
  try { http = await serveWorkspace(workspace, { port }); } catch (error) { await workspace.close(); throw error; }
  if (command === 'preview') {
    let closing = false;
    const close = async () => { if (closing) return; closing = true; await http.close(); await workspace.close(); };
    process.once('SIGINT', () => { void close(); }); process.once('SIGTERM', () => { void close(); });
    process.stdout.write(`Marmerlade: ${http.url}\nWorkspace: ${workspace.file}\nStop with Ctrl+C.\n`);
    if (!values['no-open']) await open(http.url).catch(() => process.stderr.write(`Open ${http.url} in your browser.\n`));
    return;
  }
  const server = new McpServer({ name: 'marmerlade', version: '0.1.0' });
  const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
  const tool = (fn: () => unknown | Promise<unknown>) => Promise.resolve().then(fn).then(result).catch((error: unknown) => ({ ...result({ error: error instanceof Error ? error.message : String(error) }), isError: true }));
  server.registerTool('get_workspace', { description: 'Read the diagram, wiki pages, slide decks, current revision, file and live canvas URL.' }, () => tool(() => ({ ...workspace.snapshot(), file: workspace.file, url: http.url })));
  server.registerTool('inspect_repository', { description: 'Read bounded repository manifests, README and entry points with file/line evidence. Does not execute source or invent runtime workflows.' }, () => tool(() => inspectRepository(values.repo)));
  server.registerTool('read_repository_file', { description: 'Read a source or documentation file inside the configured repository, up to 64 KiB. Use this to verify workflow call paths.', inputSchema: { path: z.string().min(1) } }, ({ path }) => tool(() => readRepositoryFile(values.repo, path)));
  server.registerTool('create_brief', {
    description: 'Propose an evidenced workflow brief without changing the canvas. Read get_workspace first. Include full Mermaid source, audience, goal, workflow, assumptions, requested exports and repository evidence. Ask the user to review its URL. Only the browser user can approve and generate; do not bypass review with import_mermaid or apply_changes.',
    inputSchema: { revision: z.number().int().nonnegative(), ...briefInputSchema.shape },
  }, ({ revision, ...input }) => tool(async () => ({ ...await workspace.stageBrief(revision, input, values.repo), url: `${http.url}/#/brief` })));
  server.registerTool('get_brief', { description: 'Read the current proposed brief, user feedback, generation status and review URL.' }, () => tool(() => ({ ...workspace.briefStatus(), url: `${http.url}/#/brief` })));
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
  server.registerTool('open_workspace', {
    description: 'Open the live browser canvas, or a node, wiki page, or slide deck.',
    inputSchema: { view: z.enum(['canvas', 'brief', 'node', 'wiki', 'slides']).default('canvas'), id: z.string().optional(), browser: z.boolean().default(true) },
  }, ({ view, id, browser }) => tool(async () => {
    if (view === 'node' && !id) throw new Error('Node view requires an id');
    const url = `${http.url}/#/${view === 'canvas' ? '' : view}${id ? '/' + encodeURIComponent(id) : ''}`;
    if (!browser) return { url, opened: false };
    try { await open(url); return { url, opened: true }; }
    catch { return { url, opened: false, message: 'Open this URL on the machine running Marmerlade, or forward its port from a remote host.' }; }
  }));
  for (const [name, filename] of [['guide', 'guide.md'], ['example', 'example.marmerlade.json'], ['workflow', 'skills/marmerlade/SKILL.md']] as const) {
    server.registerResource(name, `marmerlade://${name}`, { description: name === 'example' ? 'Complete example with diagram, wiki pages and slides' : name === 'workflow' ? 'Repository intake, brief review, generation and exports' : 'Document model, editing rules, wiki and slides syntax', mimeType: name === 'example' ? 'application/json' : 'text/markdown' }, async uri => ({ contents: [{ uri: uri.href, text: await readFile(new URL(`./${filename}`, import.meta.url), 'utf8') }] }));
  }
  let closing = false;
  async function close() { if (closing) return; closing = true; await server.close(); await http.close(); await workspace.close(); }
  process.once('SIGINT', () => { void close(); }); process.once('SIGTERM', () => { void close(); });
  process.stdin.once('end', () => { void close(); });
  try { await server.connect(new StdioServerTransport()); } catch (error) { await close(); throw error; }
  process.stderr.write(`Marmerlade: ${http.url}\nWorkspace: ${workspace.file}\n`);
}
main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
