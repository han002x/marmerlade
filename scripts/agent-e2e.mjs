// Real Codex sessions, separated by the MCP configuration reload boundary.
// Usage: node scripts/agent-e2e.mjs [--continue] [output directory] [Xray checkout directory]
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const continuation = process.argv.includes('--continue');
const positional = process.argv.slice(2).filter(argument => argument !== '--continue');
const output = resolve(positional[0] ?? join(root, 'test-results', `agent-${Date.now()}`));
const xray = resolve(positional[1] ?? join(root, '../xray'));
const project = join(output, 'project');
const evidence = join(output, 'agent');
const cli = join(root, 'dist/cli.js');
const workspace = join(project, 'xray-dir.marmerlade.json');
await mkdir(dirname(output), { recursive: true });
if (!continuation) {
  await mkdir(output, { recursive: false });
  await mkdir(project);
  await mkdir(evidence);
} else {
  await readFile(workspace);
}
await readFile(cli);

function sourceState() {
  return Object.fromEntries(['xray-api', 'xray-web'].map(name => {
    const cwd = join(xray, name);
    const git = args => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    return [name, { head: git(['rev-parse', 'HEAD']), status: git(['status', '--porcelain=v1']), diff: git(['diff', '--stat']) }];
  }));
}
const before = continuation ? JSON.parse(await readFile(join(evidence, 'sources-before.json'), 'utf8')) : sourceState();
if (!continuation) await writeFile(join(evidence, 'sources-before.json'), JSON.stringify(before, null, 2) + '\n');

// Inherit the configured model and authentication. Disable unrelated services
// without logging their commands, environment, URLs, or authentication headers.
let config = {};
try {
  config = parse(await readFile(join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'config.toml'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const overrides = [
  '-c', 'approval_policy="never"',
  '-c', 'features.apps=false',
  '-c', `projects.${project}.trust_level="trusted"`,
];
for (const name of Object.keys(config.mcp_servers ?? {})) {
  assert(!name.includes('.'), 'MCP names containing dots require a separate test profile');
  overrides.push('-c', `mcp_servers.${name}.enabled=false`);
}

async function agent(phase, prompt) {
  await writeFile(join(evidence, `${phase}-prompt.md`), prompt);
  const events = createWriteStream(join(evidence, `${phase}.jsonl`));
  const stderr = createWriteStream(join(evidence, `${phase}-stderr.log`));
  const args = ['exec', '-C', project, '-s', 'danger-full-access', '--skip-git-repo-check', '--ephemeral', '--json',
    '-o', join(evidence, `${phase}-result.md`), ...overrides, '-'];
  const child = spawn('codex', args, { cwd: project, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(prompt);
  child.stderr.pipe(stderr);
  const calls = [];
  const reader = createInterface({ input: child.stdout });
  reader.on('line', line => {
    // Image payloads add megabytes without adding evidence beyond their saved PNG.
    let event;
    try { event = JSON.parse(line); } catch { events.write(line + '\n'); return; }
    function omitImages(value) {
      if (typeof value === 'string' && value.startsWith('{') && value.includes('"type":"image"')) {
        try { return JSON.stringify(omitImages(JSON.parse(value))); } catch { return value; }
      }
      if (!value || typeof value !== 'object') return value;
      if (value.type === 'image' && typeof value.data === 'string') return { ...value, data: '[saved image payload omitted]' };
      return Array.isArray(value) ? value.map(omitImages) : Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, omitImages(entry)]));
    }
    events.write(JSON.stringify(omitImages(event)) + '\n');
    const item = event.item;
    if (event.type === 'item.completed' && item?.type === 'mcp_tool_call') {
      calls.push({ server: item.server, tool: item.tool, status: item.status });
      process.stdout.write(`${phase}: ${item.server}.${item.tool} ${item.status}\n`);
    }
    if (event.type === 'error' || event.type === 'turn.failed') process.stdout.write(`${phase}: ${JSON.stringify(event)}\n`);
  });
  process.stdout.write(`${phase}: agent started\n`);
  const code = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', resolveExit);
  });
  await new Promise(resolveEnd => events.end(resolveEnd));
  await new Promise(resolveEnd => stderr.end(resolveEnd));
  await writeFile(join(evidence, `${phase}-calls.json`), JSON.stringify(calls, null, 2) + '\n');
  assert.equal(code, 0, `${phase} agent exited with code ${code}; inspect ${evidence}`);
  process.stdout.write(`${phase}: agent completed\n`);
  return calls;
}

const safety = `Work only in ${project} and write reports under ${evidence}. Treat ${xray} and ${root} as read-only sources. Do not read credentials, .env files, auth files, or unrelated global MCP configuration. Do not call production, databases, Xray APIs, or deploy anything. Do not change global host settings. This test is authorized to install project-local configuration and use the existing local package. Never directly edit a workspace JSON file while an MCP server owns it.\n`;

try {
  if (!continuation) await agent('setup', `Run the first-run setup part of a real agent-to-Marmerlade end-to-end test.\n${safety}\nRead and follow ${root}/.agents/marmerlade-setup/SKILL.md. The target host is Codex. Reuse the built local package at ${cli} and the current Node runtime. Configure this project for the workspace ${workspace}. Verify the setup's own runtime and MCP checks. Repeat setup once to verify idempotence and save the JSON results under ${evidence}. Do not create content yet. This session started before project MCP configuration existed. Explain the reload boundary in your result; the next fresh Codex session will test actual tools. Record image-generation capability honestly from the tools available in this host. Finish with setup status and concrete paths.\n`);

  const prompt = continuation
    ? `Continue the interrupted acceptance run in this existing project. The prior agent process ended before its handoff. Keep the authored workspace and stable IDs. Read the installed director/setup/docs skills and get_workspace first. Read ${evidence}/author-prompt.md for the original task and inspect current output files. The workspace already has source-grounded wiki content and a deck; check them rather than recreating them. Old render jobs belong to the terminated process, so request a fresh native GIF and poll its new job to completion. Recheck current/expanded/collapsed and mixed drill-down previews, all wiki pages and slides, native GIF frames, original image retention, and Mermaid export. Save the missing brief, source-grounding report, completion report, and final artifacts.json under ${evidence}. Record any earlier failed preview/GIF attempts accurately. The still-preview renderer was just fixed to finish finite animations before capture; inspect the final slide images. This fresh MCP session also verifies reopening the saved file. Finish the handoff without starting a separate server that competes for the workspace lock.\n${safety}\n`
    : `Create the complete local Marmerlade experience for this user request: "Xray data inaccuracy report" is the key workflow. Inspect the Xray repo for its intent and implementation. This is a real end-to-end acceptance run, not a plan.\n${safety}\nUse the installed marmerlade-director, marmerlade-setup, and marmerlade-docs skills in .agents/skills. Discover and call this project's Marmerlade MCP tools. Do not replace them with a hand-written SDK client or direct JSON writes.\nAudience: an Xray reviewer and an engineer who need to understand the current DIR workflow and its boundaries. Sources: ${xray}/xray-api and ${xray}/xray-web. Read applicable instructions and relevant README, plans/specs, current UI, API routes, services, and report-generation code. Determine which workflow is current from implementation. Distinguish implemented behavior, intended behavior, and anything not verified at runtime. Cite exact local source paths and useful line numbers in the wiki and your source report. Use no customer data; this is a source-derived explanation.\nDeliver a saved editable project with a clear overview, meaningful nested drill-down levels, linked wiki explanations, and a short linked presentation deck. Include success, decision, skip, blocking, and export paths where the current code supports them. Honor the product showcase's Halloween theme, recognizable catalog icons including Kiro in an explicitly identified authoring/tool context, and restrained animation. Import at least one real image asset into a relevant node with import_image. Reuse an appropriate public asset from Xray or a supplied local asset; label generic artwork honestly. Discover whether this host has image generation rather than claiming it does.\nUse layout_diagram, inspect native render_preview images and diagnostics, and correct problems until current, expanded, and collapsed views are readable without overlapping nodes. Save individual previews for overview, drill-down, a linked wiki page, and all slides. Do not equate schema validity with readable output. Export a native animated GIF with export_gif, poll get_render_job to completion, inspect the resulting animation, and save a manifest of final preview and GIF paths plus diagnostics in ${evidence}/artifacts.json. Verify the editable file reopens using get_workspace and export Mermaid as a second structural artifact. Call open_workspace for the finished local view and record its actual result.\nDo useful independent work without asking questions whose answers the source provides. Save a brief, a source-grounding report, and a completion report under ${evidence}. Keep canvas labels short and wiki prose focused. Do not overfill the canvas just to include every detail. Explain any genuine capability or runtime gap instead of claiming it passed.\n`;
  const calls = await agent(continuation ? `author-resume-${Date.now()}` : 'author', prompt);
  if (continuation) {
    const events = (await readFile(join(evidence, 'author.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    calls.push(...events.filter(event => event.type === 'item.completed' && event.item?.type === 'mcp_tool_call').map(event => ({ server: event.item.server, tool: event.item.tool, status: event.item.status })));
  }
  const required = ['get_workspace', 'diagnose_environment', 'list_icons', 'apply_changes', 'import_image',
    'layout_diagram', 'render_preview', 'export_gif', 'get_render_job', 'export_mermaid', 'open_workspace'];
  const used = new Set(calls.filter(call => call.status === 'completed').map(call => call.tool));
  const missing = required.filter(tool => !used.has(tool));
  assert.deepEqual(missing, [], `Agent did not complete required MCP tools: ${missing.join(', ')}`);
  const after = sourceState();
  await writeFile(join(evidence, 'sources-after.json'), JSON.stringify(after, null, 2) + '\n');
  assert.deepEqual(after, before, 'Xray source state changed during the acceptance run');
  await writeFile(join(evidence, 'run.json'), JSON.stringify({ status: 'agent-completed', project, workspace, evidence, requiredTools: required, calls: calls.length, sourcesUnchanged: true }, null, 2) + '\n');
  process.stdout.write(`Agent workflow complete. Independent artifact audit required: ${output}\n`);
} catch (error) {
  await writeFile(join(evidence, 'run.json'), JSON.stringify({ status: 'failed', error: error.message, project, workspace }, null, 2) + '\n');
  throw error;
}
