// Canvas interaction profile: `npm run perf` (starts the dev server on :5187 if none is running).
// Reports frame times and React commits while dragging, panning/zooming, selecting and hovering.
import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';

const URL = process.env.PERF_URL ?? 'http://127.0.0.1:5187/?perf';
const COUNT = 40;

// reuse a running dev server, or start one for the length of the run
const up = () => fetch(URL).then((r) => r.ok, () => false);
// PERF_PROD=1 measures a production build (frame times only; React's Profiler is dev-only)
let server;
if (!(await up())) {
  if (process.env.PERF_PROD) {
    execFileSync('npx', ['vite', 'build', '--outDir', 'dist/perf'], { stdio: 'ignore' });
    server = spawn('npx', ['vite', 'preview', '--outDir', 'dist/perf', '--host', '127.0.0.1', '--port', '5187', '--strictPort'], { stdio: 'ignore', detached: true });
  } else {
    server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5187', '--strictPort'], { stdio: 'ignore', detached: true });
  }
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
}

const nodes = Array.from({ length: COUNT }, (_, i) => ({
  id: `n${i}`,
  label: `Node ${i}`,
  shape: i % 5 === 0 ? 'round' : 'rect',
  parentId: i < 8 ? 'g1' : i < 16 ? 'g2' : null,
  collapsed: false,
  position: { x: (i % 8) * 190, y: Math.floor(i / 8) * 130 },
}));
nodes.push(
  { id: 'g1', label: 'Group one', shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 } },
  { id: 'g2', label: 'Group two', shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 } },
);
const edges = Array.from({ length: COUNT - 1 }, (_, i) => ({
  id: `e${i}`, source: `n${i}`, target: `n${i + 1}`, label: i % 3 === 0 ? 'step' : undefined,
}));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.addInitScript((diagram) => {
  localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 3, diagram }));
  localStorage.setItem('marmerlade.welcomed', '1');
}, { nodes, edges });
await page.goto(URL);
await page.locator('.mf-node').first().waitFor();
await page.waitForTimeout(1500);

await page.evaluate(() => {
  window.__frames = [];
  let last = performance.now();
  const tick = (t) => { window.__frames.push(t - last); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});

async function measure(name, run) {
  await page.evaluate(() => { window.__frames.length = 0; if (window.__perf) { window.__perf.commits = 0; window.__perf.ms = 0; } });
  await run();
  const r = await page.evaluate(() => {
    const f = [...window.__frames].sort((a, b) => a - b);
    const at = (q) => f[Math.min(f.length - 1, Math.floor(f.length * q))] ?? 0;
    return { frames: f.length, p50: at(0.5), p95: at(0.95), slow: f.filter((x) => x > 20).length, ...(window.__perf ?? {}) };
  });
  const by = await page.evaluate(() => { const b = { ...window.__by, why: window.__why }; window.__by = {}; window.__why = {}; return b; });
  if (by && process.env.PERF_BY) console.log(name, JSON.stringify(by));
  return { name, ...r };
}

const box = await page.locator('.mf-node').filter({ hasText: 'Node 20' }).boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

const rows = [];
rows.push(await measure('drag', async () => {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 90; i++) { await page.mouse.move(cx + i * 3, cy + Math.sin(i / 6) * 60); await page.waitForTimeout(16); }
  await page.mouse.up();
}));
rows.push(await measure('pan+zoom', async () => {
  await page.mouse.move(700, 800);
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, i < 20 ? -40 : 40); await page.waitForTimeout(16); }
  await page.mouse.move(700, 800);
  await page.mouse.down({ button: 'middle' });
  for (let i = 0; i < 60; i++) { await page.mouse.move(700 + i * 4, 800 - i * 2); await page.waitForTimeout(16); }
  await page.mouse.up({ button: 'middle' });
}));
// centres of nodes that are on screen and not covered by anything
const points = () => page.locator('.mf-node').evaluateAll((els) => els.flatMap((e) => {
  const r = e.getBoundingClientRect();
  const x = r.x + r.width / 2, y = r.y + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  return x > 0 && y > 60 && x < innerWidth - 380 && y < innerHeight && hit && e.contains(hit) ? [[x, y]] : [];
}));
rows.push(await measure('select', async () => {
  const items = await points();
  for (let i = 0; i < 12; i++) {
    const [x, y] = items[i % items.length];
    await page.mouse.click(x, y);
    await page.waitForTimeout(40);
  }
}));
rows.push(await measure('hover', async () => {
  const items = await points();
  for (const [x, y] of items.slice(0, 20)) { await page.mouse.move(x, y, { steps: 4 }); await page.waitForTimeout(30); }
}));

console.table(rows.map((r) => ({
  interaction: r.name, frames: r.frames, 'p50 ms': +r.p50.toFixed(1), 'p95 ms': +r.p95.toFixed(1),
  'frames >20ms': r.slow, commits: r.commits ?? '-', 'render ms': r.ms ? +r.ms.toFixed(0) : '-',
})));
await browser.close();
if (server?.pid) process.kill(-server.pid);
