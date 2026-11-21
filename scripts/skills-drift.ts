// Fails when the agent-facing docs and skills disagree with the real MCP server.
// Needs a built server (`npm run build`). Run: node --experimental-strip-types scripts/skills-drift.ts
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { hostNames } from '../server/setup.ts';
import { applyChanges } from '../server/workspace.ts';
import { changeSchema, parseDiagram } from '../src/workspaceSchema.ts';

const read = (path: string) => readFile(resolve(path), 'utf8');
const dir = await mkdtemp(join(tmpdir(), 'marmerlade-drift-'));
const client = new Client({ name: 'drift', version: '1.0.0' });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('dist/cli.js'), '--file', join(dir, 'w.marmerlade.json')], cwd: dir, stderr: 'ignore' }));
  const tools = (await client.listTools()).tools;
  const prompts = (await client.listPrompts()).prompts;
  const mcp = await read('.agents/marmerlade-docs/references/mcp.md');
  const setup = await read('.agents/marmerlade-setup/SKILL.md');
  const problems: string[] = [];
  const need = (ok: boolean, message: string) => { if (!ok) problems.push(message); };

  for (const tool of tools) {
    need(mcp.includes(`\`${tool.name}\``), `references/mcp.md does not mention tool ${tool.name}`);
    for (const key of Object.keys((tool.inputSchema.properties ?? {}) as object))
      need(mcp.includes(key), `references/mcp.md does not mention ${tool.name} input "${key}"`);
  }
  const kinds = ((tools.find(t => t.name === 'apply_changes')!.inputSchema.properties as any).changes.items.oneOf as any[]).map(o => o.properties.kind.const as string);
  for (const kind of kinds) need(mcp.includes(`\`${kind}\``), `references/mcp.md does not mention change kind ${kind}`);
  for (const prompt of prompts) need(mcp.includes(`\`${prompt.name}\``), `references/mcp.md does not mention prompt ${prompt.name}`);
  const words: Record<number, string> = { 2: 'two', 12: 'twelve' };
  need(mcp.includes(`${words[tools.length] ?? tools.length} tools`), `references/mcp.md tool count differs from ${tools.length}`);

  for (const host of hostNames) need(setup.includes(`\`${host}\``), `marmerlade-setup does not mention host ${host}`);
  need(!/Kiro or Codex/.test(setup), 'marmerlade-setup still limits hosts to Kiro or Codex');

  const skillDirs = (await readdir('.agents', { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name);
  const installers = await Promise.all(['server/setup.ts', 'scripts/build-package.mjs'].map(read));
  for (const skill of skillDirs) installers.forEach((text, i) => need(text.includes(`'${skill}'`), `${['server/setup.ts', 'scripts/build-package.mjs'][i]} does not ship skill ${skill}`));

  const example = JSON.parse(await read('.agents/marmerlade-director/references/example-batch.json'));
  const changes = example.changes.map((c: unknown) => changeSchema.parse(c));
  parseDiagram(applyChanges({ nodes: [], edges: [], pages: [], decks: [] }, changes));

  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
  console.log(`PASS: ${tools.length} tools, ${prompts.length} prompts, ${hostNames.length} hosts, ${skillDirs.length} skills match their docs`);
} finally { await client.close(); await rm(dir, { recursive: true, force: true }); }
