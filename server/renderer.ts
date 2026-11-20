import { chromium, type Browser, type Page } from 'playwright';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { renderOptionsSchema, type RenderOptions, type RenderGifOptions } from '../src/renderContract.ts';
import type { Diagram } from '../src/types.ts';
import type { Workspace } from './workspace.ts';
import { Conflict } from './workspace.ts';

type Snapshot = ReturnType<Workspace['snapshot']>;
type RenderJob = {
  id: string; revision: number; createdAt: string;
} & (
  | { status: 'queued' }
  | { status: 'running'; progress: number }
  | { status: 'complete'; file: string; bytes: number }
  | { status: 'failed'; error: string }
);

export async function projectImage(file: string, input: string) {
  const root = await realpath(dirname(file));
  const path = await realpath(resolve(root, input));
  const child = relative(root, path);
  if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) throw new Error('Image must be inside the workspace project directory');
  const info = await stat(path);
  if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error('Image must be a file no larger than 10 MiB');
  const mime: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif' };
  const type = mime[extname(path).toLowerCase()];
  if (!type) throw new Error('Unsupported image extension');
  return { path, name: basename(path), mime: type, base64: (await readFile(path)).toString('base64') };
}

function renderDiagram(diagram: Diagram, options: RenderOptions): Diagram {
  if (options.fold === 'current') return diagram;
  return { ...diagram, nodes: diagram.nodes.map(node => ({ ...node, collapsed: options.fold === 'collapsed' })) };
}

export function createRenderer(workspace: Workspace, url: string) {
  let browser: Promise<Browser> | undefined;
  let queue = Promise.resolve();
  let pending = 0;
  let closed = false;
  const jobs = new Map<string, RenderJob>();
  const launch = () => browser ??= chromium.launch({ headless: true }).catch(error => {
    browser = undefined;
    throw new Error(`Cannot launch Chromium. Run marmerlade setup or marmerlade doctor. ${error instanceof Error ? error.message : String(error)}`);
  });
  const exclusive = <T>(action: () => Promise<T>) => {
    if (closed) throw new Error('Renderer is closed');
    if (pending >= 4) throw new Error('Renderer queue is full. Wait for an existing job to finish.');
    pending++;
    const result = queue.then(action);
    queue = result.then(() => { pending--; }, () => { pending--; });
    return result;
  };
  async function pageFor(snapshot: Snapshot, options: RenderOptions, timeout = 45_000) {
    if (options.view === 'wiki' && !snapshot.diagram.pages?.some(page => page.id === options.id)) throw new Error('Wiki page not found');
    if (options.view === 'slides' && !snapshot.diagram.decks?.some(deck => deck.id === options.id)) throw new Error('Slide deck not found');
    if (options.nodeId && !snapshot.diagram.nodes.some(node => node.id === options.nodeId)) throw new Error('Context node not found');
    const context = await (await launch()).newContext({ viewport: { width: options.width, height: options.height }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    const deadline = setTimeout(() => { void context.close({ reason: 'Native rendering exceeded its time limit. Reduce the project or image size and retry.' }).catch(() => {}); }, timeout);
    const close = async () => { clearTimeout(deadline); await context.close(); };
    try {
      await context.addInitScript(({ diagram, appearance }) => {
        window.__marmerladeRender = true;
        localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: diagram.diagrams ? 5 : diagram.sequence === undefined ? 3 : 4, diagram }));
        localStorage.setItem('marmerlade.appearance', JSON.stringify({ selected: appearance, custom: null }));
      }, { diagram: renderDiagram(snapshot.diagram, options), appearance: options.appearance });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const target = options.view === 'canvas' ? (options.diagramKind === 'sequence' ? 'diagrams/sequence' : '') : `${options.view}/${encodeURIComponent(options.id ?? '')}`;
      const query = new URLSearchParams();
      if (options.nodeId) query.set('node', options.nodeId);
      if (options.view === 'slides') query.set('slide', String(options.slide));
      await page.goto(`${url}/#/${target}${query.size ? `?${query}` : ''}`, { waitUntil: 'load' });
      if (options.view === 'canvas' && options.diagramKind === 'sequence') {
        if (!snapshot.diagram.sequence) throw new Error('No sequence diagram in this workspace');
        await page.locator('.sq-image svg, .sq-empty').waitFor({ state: 'visible' });
      } else if (options.view === 'canvas') {
        await page.waitForFunction(() => !!window.marmerladeRenderer && document.querySelector('.react-flow__viewport'));
        await page.evaluate(async () => { if (window.marmerladeRenderer) await window.marmerladeRenderer.fit(); });
        await page.addStyleTag({ content: '.mf-toolbar,.mf-style-panel,.mf-reopen,.react-flow__controls,.react-flow__minimap {display:none!important}' });
      } else {
        await page.locator(options.view === 'wiki' ? '.wk-document' : '.sl-slide').first().waitFor({ state: 'visible' });
        if (options.view === 'wiki') await page.getByRole('tab', { name: 'Read', exact: true }).click();
        if (snapshot.diagram.sequence) await page.waitForFunction(() =>
          Array.from(document.querySelectorAll('.embed[data-sequence]')).every(el => el.hasAttribute('data-shown')));
      }
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, image => image.decode().catch(() => {})));
      });
      return { page, errors, close };
    } catch (error) { await close(); throw error; }
  }

  async function outputFile(name: string) {
    const directory = resolve(dirname(workspace.file), 'marmerlade-output');
    await mkdir(directory, { recursive: true });
    const actual = await realpath(directory);
    if (actual !== directory) throw new Error('Output directory must not be a symlink');
    return resolve(actual, name);
  }
  function snapshot(revision: number) {
    const value = workspace.snapshot();
    if (value.revision !== revision) throw new Conflict('Workspace changed. Read the latest revision before rendering.');
    return value;
  }
  async function diagnostics(page: Page, diagram: Diagram, errors: string[]) {
    const nodes = await page.evaluate(() => window.marmerladeRenderer?.measure() ?? []);
    const ancestors = (id: string) => {
      const result = new Set<string>();
      let node = diagram.nodes.find(node => node.id === id);
      while (node?.parentId) { result.add(node.parentId); node = diagram.nodes.find(parent => parent.id === node?.parentId); }
      return result;
    };
    const clean = (id: string) => id.replace(/^__sheet__/, '');
    const overlaps: Array<{ first: string; second: string }> = [];
    for (let i = 0; i < nodes.length; i++) for (const other of nodes.slice(i + 1)) {
      const node = nodes[i];
      if (ancestors(clean(node.id)).has(clean(other.id)) || ancestors(clean(other.id)).has(clean(node.id))) continue;
      if (Math.min(node.x + node.width, other.x + other.width) - Math.max(node.x, other.x) > 2 && Math.min(node.y + node.height, other.y + other.height) - Math.max(node.y, other.y) > 2) overlaps.push({ first: node.id, second: other.id });
    }
    const viewport = page.viewportSize();
    const clipped = viewport ? nodes.filter(node => node.x < 0 || node.y < 0 || node.x + node.width > viewport.width || node.y + node.height > viewport.height).map(node => node.id) : [];
    const images = await page.locator('img').evaluateAll(images => images.filter(image => image instanceof HTMLImageElement && (!image.complete || image.naturalWidth === 0)).map(image => image.getAttribute('src')?.slice(0, 120) ?? ''));
    const contentOverflow = await page.locator('.sl-slide').evaluateAll(slides => slides.some(slide => slide.scrollHeight > slide.clientHeight + 2 || slide.scrollWidth > slide.clientWidth + 2));
    const smallLabels = await page.locator('.mf-node-label').evaluateAll(labels => labels.filter(label => label.textContent?.trim() && label.getBoundingClientRect().height < 12).map(label => label.textContent));
    return { overlaps, clipped, failedImages: images, errors, contentOverflow, smallLabels, visibleNodes: nodes.map(node => node.id) };
  }

  return {
    validateSequence(revision: number, source: string) {
      const value = snapshot(revision);
      return exclusive(async () => {
        const session = await pageFor(value, renderOptionsSchema.parse({}));
        try { await session.page.evaluate(source => window.marmerladeRenderer!.validateSequence(source), source); }
        finally { await session.close(); }
      });
    },
    preview(revision: number, options: RenderOptions) {
      const value = snapshot(revision);
      return exclusive(async () => {
        const session = await pageFor(value, options);
        try {
          const file = await outputFile(`preview-${randomUUID()}.png`);
          const checks = await diagnostics(session.page, value.diagram, session.errors);
          await session.page.screenshot({ path: file, animations: 'disabled' });
          return { revision: value.revision, file, diagnostics: checks };
        } finally { await session.close(); }
      });
    },
    layout(revision: number, direction: 'TB' | 'LR') {
      const value = snapshot(revision);
      return exclusive(async () => {
        const session = await pageFor(value, renderOptionsSchema.parse({ fold: 'expanded' }));
        try {
          const laidOut = await session.page.evaluate(direction => {
            if (!window.marmerladeRenderer) throw new Error('Renderer not ready');
            return window.marmerladeRenderer.layout(direction);
          }, direction);
          const positions = new Map(laidOut.nodes.map(node => [node.id, node.position]));
          return workspace.commit(revision, current => ({ ...current, nodes: current.nodes.map(node => ({ ...node, position: positions.get(node.id) ?? node.position })) }));
        } finally { await session.close(); }
      });
    },
    importImage(revision: number, nodeId: string, path: string) {
      const value = snapshot(revision);
      if (!value.diagram.nodes.some(node => node.id === nodeId)) throw new Error('Image target node not found');
      return exclusive(async () => {
        const input = await projectImage(workspace.file, path);
        const session = await pageFor(value, renderOptionsSchema.parse({}));
        try {
          const image = await session.page.evaluate(async input => {
            if (!window.marmerladeRenderer) throw new Error('Renderer not ready');
            return window.marmerladeRenderer.importImage(input.base64, input.name, input.mime);
          }, input);
          const saved = await workspace.commit(revision, current => ({ ...current, nodes: current.nodes.map(node => node.id === nodeId ? { ...node, image } : node) }));
          return { revision: saved.revision, nodeId, original: input.path, image: { w: image.w, h: image.h, bytes: image.src.length } };
        } finally { await session.close(); }
      });
    },
    exportGif(revision: number, options: RenderOptions, gif: RenderGifOptions) {
      if (options.diagramKind === 'sequence') throw new Error('GIF export requires a flowchart');
      if (options.view !== 'canvas') throw new Error('GIF export supports the canvas view');
      const value = snapshot(revision);
      if (!value.diagram.nodes.length) throw new Error('Add diagram nodes before exporting a GIF');
      const id = randomUUID();
      const base = { id, revision: value.revision, createdAt: new Date().toISOString() };
      // Keep the in-memory result list bounded without discarding active work.
      for (const [key, job] of jobs) if (jobs.size > 100 && (job.status === 'complete' || job.status === 'failed')) jobs.delete(key);
      const work = exclusive(async () => {
        jobs.set(id, { ...base, status: 'running', progress: 0 });
        const session = await pageFor(value, options, 240_000);
        let timedOut = false;
        const deadline = setTimeout(() => { timedOut = true; void session.close(); }, 180_000);
        const timer = setInterval(() => {
          void session.page.evaluate(() => window.__marmerladeProgress).then(progress => {
            if (progress && jobs.get(id)?.status === 'running') jobs.set(id, { ...base, status: 'running', progress: progress.frame / progress.total });
          }).catch(() => {});
        }, 1000);
        try {
          const encoded = await session.page.evaluate(gif => {
            if (!window.marmerladeRenderer) throw new Error('Renderer not ready');
            return window.marmerladeRenderer.gif(gif);
          }, gif);
          const file = await outputFile(`diagram-${id}.gif`);
          const data = Buffer.from(encoded, 'base64');
          await writeFile(file, data, { flag: 'wx' });
          jobs.set(id, { ...base, status: 'complete', file, bytes: data.length });
        } catch (error) {
          if (timedOut) throw new Error('GIF capture exceeded three minutes. Reduce the frame rate, size, or animation duration.');
          throw error;
        } finally { clearTimeout(deadline); clearInterval(timer); await session.close(); }
      });
      jobs.set(id, { ...base, status: 'queued' });
      void work.catch(error => jobs.set(id, { ...base, status: 'failed', error: error instanceof Error ? error.message : String(error) }));
      return { jobId: id, revision: value.revision, status: 'queued' };
    },
    job(id: string) {
      const job = jobs.get(id);
      if (!job) throw new Error('Render job not found in this server session');
      return job;
    },
    async close() {
      closed = true;
      if (browser) await (await browser.catch(() => undefined))?.close();
      await queue;
    },
  };
}
