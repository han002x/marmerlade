import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
import { parse, stringify } from 'smol-toml';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { diagnoseEnvironment, playwrightCli } from './environment.ts';

const run = promisify(execFile);
const table = z.record(z.string(), z.unknown());
const skills = ['marmerlade-director', 'marmerlade-docs', 'marmerlade-setup'];

export const hostNames = ['codex', 'kiro', 'claude', 'cursor', 'antigravity'] as const;
export type Host = typeof hostNames[number];
// Antigravity only reads MCP servers from a user-level file; the others are project-scoped.
const hostConfig = (project: string, host: Host) => ({
  codex: { config: resolve(project, '.codex/config.toml'), key: 'mcp_servers', skills: '.agents/skills' },
  kiro: { config: resolve(project, '.kiro/settings/mcp.json'), key: 'mcpServers', skills: '.kiro/skills' },
  claude: { config: resolve(project, '.mcp.json'), key: 'mcpServers', skills: '.claude/skills' },
  cursor: { config: resolve(project, '.cursor/mcp.json'), key: 'mcpServers', skills: '.cursor/skills' },
  antigravity: { config: resolve(homedir(), '.gemini/antigravity/mcp_config.json'), key: 'mcpServers', skills: '.agent/skills' },
})[host];

async function existing(path: string) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return ''; throw error; }
}

export async function setupProject(options: { project: string; file: string; host: Host | 'both'; name: string; browser: boolean; replace: boolean }) {
  const project = resolve(options.project);
  const file = resolve(project, options.file);
  await mkdir(project, { recursive: true });
  const release = await lockfile.lock(resolve(project, '.marmerlade-setup'), { realpath: false });
  try {
    await mkdir(dirname(file), { recursive: true });
    const cli = fileURLToPath(import.meta.url);
    const command = process.execPath;
    const args = [cli, '--file', file];
    const hosts = options.host === 'both' ? ['codex', 'kiro'] as Host[] : [options.host];
    const planned: Array<{ path: string; content: string; original: string }> = [];
    for (const host of hosts) {
      const { config: path, key } = hostConfig(project, host);
      const original = await existing(path);
      const document = host === 'codex' ? original ? parse(original) : {} : table.parse(original ? JSON.parse(original) : {});
      const servers = table.parse(document[key] ?? {});
      const desired = host === 'kiro' ? { command, args, disabled: false } : { command, args };
      const prior = Object.hasOwn(servers, options.name) ? servers[options.name] : undefined;
      if (prior !== undefined) {
        const saved = table.parse(prior);
        if ((saved.command !== command || JSON.stringify(saved.args) !== JSON.stringify(args)) && !options.replace) throw new Error(`${path} already has a different ${options.name} server. Choose --name or explicitly use --replace.`);
        if (saved.command === command && JSON.stringify(saved.args) === JSON.stringify(args) && (host !== 'kiro' || saved.disabled !== true)) continue;
      }
      // Preserve host-specific settings on the selected entry as well as other servers.
      const next = { ...document, [key]: { ...servers, [options.name]: { ...(prior === undefined ? {} : table.parse(prior)), ...desired } } };
      planned.push({ path, original, content: host === 'codex' ? stringify(next) : JSON.stringify(next, null, 2) + '\n' });
    }
    if (options.browser) {
      const status = await diagnoseEnvironment(file);
      if (status.checks.find(check => check.name === 'chromium')?.status !== 'ready') {
        await run(process.execPath, [playwrightCli(), 'install', 'chromium'], { timeout: 300_000, maxBuffer: 4 * 1024 * 1024 });
      }
    }
    const status = await diagnoseEnvironment(file);
    if (!status.ready) throw new Error(`Setup prerequisites failed: ${JSON.stringify(status.checks.filter(check => check.status !== 'ready'))}`);
    for (const host of hosts) for (const skill of skills) {
      const destination = resolve(project, hostConfig(project, host).skills, skill);
      const source = new URL(`./skills/${skill}/`, import.meta.url);
      const current = await existing(resolve(destination, 'SKILL.md'));
      const provided = await readFile(new URL('SKILL.md', source), 'utf8');
      if (current && current !== provided && !options.replace) throw new Error(`Existing skill differs: ${destination}. Use --replace only to replace that installed copy.`);
    }
    // Verify the installed server before writing client configuration.
    const client = new Client({ name: 'marmerlade-setup', version: '0.1.0' });
    const transport = new StdioClientTransport({ command, args, cwd: project, stderr: 'pipe' });
    let stderr = '';
    transport.stderr?.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
    try {
      await client.connect(transport);
      const result = await client.callTool({ name: 'get_workspace', arguments: {} });
      if (result.isError) throw new Error('MCP workspace smoke check failed');
      const available = await client.listTools();
      if (!available.tools.some(tool => tool.name === 'export_gif')) throw new Error('Installed server lacks native rendering tools');
    } catch (error) {
      throw new Error(`MCP server verification failed: ${error instanceof Error ? error.message : String(error)}\n${stderr}\nStop any existing server that owns this workspace file before rerunning setup.`);
    } finally { await client.close(); }
    for (const host of hosts) for (const skill of skills) {
      await cp(new URL(`./skills/${skill}/`, import.meta.url), resolve(project, hostConfig(project, host).skills, skill), { recursive: true });
    }
    for (const item of planned) {
      await mkdir(dirname(item.path), { recursive: true });
      if (item.original) {
        try { await writeFile(`${item.path}.marmerlade-backup`, item.original, { flag: 'wx', mode: 0o600 }); }
        catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; }
      }
      const temp = `${item.path}.${randomUUID()}.tmp`;
      await writeFile(temp, item.content, { mode: 0o600 });
      await rename(temp, item.path);
    }
    return { project, file, hosts, configured: planned.map(item => item.path), runtime: status,
      nextSteps: ['Reload the selected agent MCP connection and skills.', 'Call get_workspace, discover the host image tool, then use marmerlade-director.', 'Use open_workspace to open the live app in the local browser.'] };
  } finally { await release(); }
}
