import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { parse } from 'smol-toml';
const exec = promisify(execFile);
const cli = resolve(process.argv[2] ?? 'dist/cli.js');
const root = await mkdtemp(join(tmpdir(), 'marmerlade setup #'));
async function run(repo, client, ...flags) {
  const { stdout } = await exec(process.execPath, [cli, 'setup', '--client', client, '--repo', repo, ...flags]);
  return JSON.parse(stdout);
}
try {
  for (const client of ['codex', 'claude-code', 'kiro']) {
    const repo = join(root, client); await mkdir(repo);
    const config = join(repo, client === 'codex' ? '.codex/config.toml' : client === 'kiro' ? '.kiro/settings/mcp.json' : '.mcp.json');
    await mkdir(dirname(config), { recursive: true });
    const original = client === 'codex' ? 'model = "keep-model"\n[mcp_servers.other]\ncommand = "keep-me"\n' : JSON.stringify({ custom: true, mcpServers: { other: { command: 'keep-me' } } });
    await writeFile(config, original);
    const dry = await run(repo, client, '--dry-run'); assert.equal(dry.dryRun, true);
    assert.equal(await readFile(config, 'utf8'), original);
    const installed = await run(repo, client); assert.equal(installed.verification.preview, 'ready');
    assert.ok(installed.verification.tools.includes('create_brief'));
    assert.equal(installed.backups.length, 1);
    assert.equal(await readFile(installed.backups[0], 'utf8'), original);
    const text = await readFile(config, 'utf8');
    const doc = client === 'codex' ? parse(text) : JSON.parse(text);
    const servers = doc[client === 'codex' ? 'mcp_servers' : 'mcpServers'];
    assert.equal(servers.other.command, 'keep-me');
    assert.deepEqual(servers.marmerlade.args, [cli, '--file', join(repo, 'diagram.marmerlade.json'), '--repo', repo]);
    const skillPath = installed.changes[1].path;
    assert.ok((await readFile(skillPath, 'utf8')).includes('create_brief'));
    const repeated = await run(repo, client);
    assert.deepEqual(repeated.changes.map(change => change.action), ['unchanged', 'unchanged']);
    assert.equal(await readFile(config, 'utf8'), text);
    await run(repo, client, '--remove');
    const removed = client === 'codex' ? parse(await readFile(config, 'utf8')) : JSON.parse(await readFile(config, 'utf8'));
    assert.equal(removed[client === 'codex' ? 'mcp_servers' : 'mcpServers'].other.command, 'keep-me');
    assert.equal(removed[client === 'codex' ? 'mcp_servers' : 'mcpServers'].marmerlade, undefined);
    await assert.rejects(readFile(skillPath), /ENOENT/);
    await writeFile(config, '{ broken');
    await assert.rejects(run(repo, client), /Cannot parse/);
    assert.equal(await readFile(config, 'utf8'), '{ broken');
    assert.equal((await readdir(dirname(config))).filter(name => name.includes('.bak-')).length, 2);
  }
  console.log('PASS: packaged CLI setup for Codex, Claude Code and Kiro; real MCP/HTTP probes; dry run, preservation, backups, repeat, removal, malformed config and paths with spaces/#');
} finally { await rm(root, { recursive: true, force: true }); }
