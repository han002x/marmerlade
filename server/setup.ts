import { readFile, writeFile, mkdir, rename, copyFile, unlink, realpath, mkdtemp, rm } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { parse, stringify } from 'smol-toml';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const object = z.record(z.string(), z.unknown());
const clientSchema = z.enum(['codex', 'claude-code', 'kiro']);
async function optionalText(file: string) {
  try { return await readFile(file, 'utf8'); }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null; throw error; }
}

export async function probeServer(cli: string, repository: string) {
  const temporary = await mkdtemp(join(tmpdir(), 'marmerlade-setup-'));
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, '--file', join(temporary, 'probe.json'), '--repo', repository], stderr: 'pipe' });
  const client = new Client({ name: 'marmerlade-setup', version: '0.1.0' });
  try {
    await client.connect(transport, { timeout: 10_000 });
    const { tools } = await client.listTools({}, { timeout: 10_000 });
    for (const name of ['get_workspace', 'inspect_repository', 'create_brief', 'get_brief', 'export_mermaid']) {
      if (!tools.some(tool => tool.name === name)) throw new Error(`Server did not expose ${name}`);
    }
    const result = z.object({ isError: z.boolean().optional(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })) }).parse(await client.callTool({ name: 'get_workspace', arguments: {} }, undefined, { timeout: 10_000 }));
    const text = result.content.find(part => part.type === 'text');
    if (result.isError || !text?.text) throw new Error('Cannot read the workspace');
    const { url } = z.object({ url: z.url() }).parse(JSON.parse(text.text));
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Local preview is not ready');
    const page = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!page.ok || !(await page.text()).includes('marmerlade-workspace')) throw new Error('Built browser app is missing. Run npm run build before setup.');
    return { tools: tools.map(tool => tool.name), preview: 'ready' };
  } finally { await client.close(); await rm(temporary, { recursive: true, force: true }); }
}

export async function setup(input: { client?: string; repository: string; file: string; cli: string; dryRun?: boolean; remove?: boolean }) {
  const client = clientSchema.parse(input.client);
  const repository = await realpath(input.repository);
  const cli = await realpath(input.cli);
  const file = resolve(repository, input.file);
  const config = resolve(repository, client === 'codex' ? '.codex/config.toml' : client === 'kiro' ? '.kiro/settings/mcp.json' : '.mcp.json');
  const skillFile = resolve(repository, client === 'codex' ? '.agents/skills/marmerlade/SKILL.md' : client === 'kiro' ? '.kiro/skills/marmerlade/SKILL.md' : '.claude/skills/marmerlade/SKILL.md');
  const skill = await readFile(new URL('./skills/marmerlade/SKILL.md', pathToFileURL(cli)), 'utf8');
  const original = await optionalText(config);
  let doc: Record<string, unknown>;
  try { doc = object.parse(original === null ? {} : client === 'codex' ? parse(original) : JSON.parse(original)); }
  catch { throw new Error(`Cannot parse ${config}. Existing configuration was left unchanged.`); }
  const key = client === 'codex' ? 'mcp_servers' : 'mcpServers';
  const servers = doc[key] === undefined ? {} : object.parse(doc[key]);
  const previousServer = servers.marmerlade;
  const entry = { command: process.execPath, args: [cli, '--file', file, '--repo', repository], ...(client === 'codex' ? { enabled: true } : client === 'kiro' ? { disabled: false } : {}) };
  if (input.remove) delete servers.marmerlade;
  else servers.marmerlade = { ...(servers.marmerlade === undefined ? {} : object.parse(servers.marmerlade)), ...entry };
  if (!input.remove || doc[key] !== undefined) doc[key] = servers;
  const previousSkill = await optionalText(skillFile);
  const configChanged = input.remove ? previousServer !== undefined : !isDeepStrictEqual(previousServer === undefined ? undefined : { ...object.parse(previousServer) }, servers.marmerlade);
  const skillChanged = input.remove ? previousSkill === skill : previousSkill !== skill;
  if (!input.remove && previousSkill !== null && previousSkill !== skill) throw new Error(`A different skill already exists at ${skillFile}. Preserve or rename it before setup.`);
  const changes = [
    { path: config, action: configChanged ? input.remove ? 'remove server' : 'register server' : 'unchanged' },
    { path: skillFile, action: skillChanged ? input.remove ? 'remove skill' : 'install skill' : 'unchanged' },
  ];
  if (input.dryRun) return { client, scope: 'project', dryRun: true, changes, server: entry };
  const verification = input.remove ? null : await probeServer(cli, repository);
  const backups: string[] = [];
  if (configChanged) {
    await mkdir(dirname(config), { recursive: true });
    const current = await optionalText(config);
    if (current !== original) throw new Error('Configuration changed during setup. Run setup again.');
    if (original !== null) {
      const backup = `${config}.bak-${randomUUID()}`;
      await copyFile(config, backup); backups.push(backup);
    }
    const temp = `${config}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, client === 'codex' ? stringify(doc) : JSON.stringify(doc, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      await rename(temp, config);
    } finally { await unlink(temp).catch(() => {}); }
  }
  if (skillChanged) {
    if (input.remove) await unlink(skillFile);
    else { await mkdir(dirname(skillFile), { recursive: true }); await writeFile(skillFile, skill, { flag: 'wx' }); }
  }
  return { client, scope: 'project', changes, backups, verification, next: input.remove ? 'Marmerlade entries removed; workspace files retained.' : 'Restart the client connection in this trusted project. Ask: Use Marmerlade to explain this repository. Review the brief in your browser before generating.' };
}
