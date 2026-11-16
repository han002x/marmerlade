import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import lockfile from 'proper-lockfile';
import { parseDiagram } from '../src/workspaceSchema.ts';

export const playwrightCli = () => resolve(dirname(createRequire(import.meta.url).resolve('playwright/package.json')), 'cli.js');

export async function diagnoseEnvironment(file: string, options: { probe?: boolean; ownsWorkspace?: boolean } = {}) {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  const checks: Array<{ name: string; status: 'ready' | 'missing' | 'busy'; detail: string; fix?: { command: string; args: string[] } }> = [];
  checks.push({ name: 'node', status: major > 22 || major === 22 && minor >= 12 ? 'ready' : 'missing', detail: process.version });
  try {
    await readFile(new URL('./web/index.html', import.meta.url));
    checks.push({ name: 'web', status: 'ready', detail: 'Packaged app found' });
  } catch { checks.push({ name: 'web', status: 'missing', detail: 'Packaged app missing. Build the source checkout or reinstall the package.' }); }
  try {
    await access(dirname(resolve(file)), constants.W_OK);
    checks.push({ name: 'project', status: 'ready', detail: dirname(resolve(file)) });
  } catch { checks.push({ name: 'project', status: 'missing', detail: 'Project directory is missing or not writable' }); }
  try {
    const raw: unknown = JSON.parse(await readFile(resolve(file), 'utf8'));
    if (raw && typeof raw === 'object' && 'diagram' in raw) {
      if ('version' in raw && ![1, 2, 3].includes(Number(raw.version))) throw new Error('Unsupported file version');
      parseDiagram(raw.diagram);
    } else parseDiagram(raw);
    checks.push({ name: 'workspace', status: 'ready', detail: 'Workspace format and references are valid' });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') checks.push({ name: 'workspace', status: 'ready', detail: 'New workspace will be saved on its first edit' });
    else checks.push({ name: 'workspace', status: 'missing', detail: error instanceof Error ? error.message : String(error) });
  }
  const busy = !options.ownsWorkspace && await lockfile.check(resolve(file), { realpath: false });
  checks.push({ name: 'workspace-lock', status: busy ? 'busy' : 'ready', detail: busy ? 'Another server owns this file. Connect to it or stop it before starting a second writer.' : options.ownsWorkspace ? 'Owned by this MCP server' : 'No active writer lock' });
  try {
    await access(chromium.executablePath(), constants.X_OK);
    if (options.probe !== false) { const browser = await chromium.launch({ headless: true, timeout: 15_000 }); await browser.close(); }
    checks.push({ name: 'chromium', status: 'ready', detail: chromium.executablePath() });
  } catch (error) {
    checks.push({ name: 'chromium', status: 'missing', detail: error instanceof Error ? error.message : String(error), fix: { command: process.execPath, args: [playwrightCli(), 'install', 'chromium'] } });
  }
  return {
    ready: checks.every(check => check.status === 'ready'), platform: process.platform, arch: process.arch,
    wsl: !!process.env.WSL_DISTRO_NAME, checks,
    imageGeneration: { status: 'host-managed', detail: 'The host agent must discover its image-generation tool. No provider or credentials are installed by Marmerlade.' },
    cli: fileURLToPath(import.meta.url),
  };
}
