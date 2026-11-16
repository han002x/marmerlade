import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from '/home/han/projects/merfolk/node_modules/playwright/index.mjs';

const project = dirname(fileURLToPath(import.meta.url));
const agent = resolve(project, '../agent');
const evidence = JSON.parse(await readFile(resolve(agent, 'acceptance-evidence.json'), 'utf8'));
const base = evidence.final.url;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1800, height: 1800 } });
  await context.addInitScript(() => {
    localStorage.setItem('marmerlade.appearance', JSON.stringify({ selected: 'halloween', custom: null }));
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['http:', 'https:'].includes(url.protocol) && url.origin !== base ? route.abort() : route.continue();
  });
  const page = await context.newPage();
  const waitPage = title => page.waitForFunction(expected => document.querySelector('[aria-label="Page title"]')?.value === expected, title);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/#/wiki/overview');
  await page.getByRole('tab', { name: 'Read', exact: true }).click();
  await waitPage('Xray DIR today');
  await page.getByRole('link', { name: 'Study setup and scope', exact: true }).last().click();
  await waitPage('Study setup and scope');
  assert.ok(page.url().includes('#/wiki/setup'));
  await page.goto(base + '/#/wiki/geometry_map');
  await page.getByRole('tab', { name: 'Read', exact: true }).click();
  await waitPage('Geometry decision map');
  await page.locator('.wk-preview svg').first().waitFor();
  await page.getByRole('link', { name: 'Geometry review decisions', exact: true }).last().click();
  await waitPage('Geometry review decisions');
  await page.goto(base + '/#/slides/briefing?slide=5');
  await page.getByRole('heading', { name: 'Hand off the report and its limits', exact: true }).waitFor();
  const popupReady = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Intent and verification', exact: true }).click();
  const wikiWindow = await popupReady;
  await wikiWindow.getByRole('tab', { name: 'Read', exact: true }).click();
  await wikiWindow.waitForFunction(() => document.querySelector('[aria-label="Page title"]')?.value === 'Intent and verification');
  await wikiWindow.close();
  await page.goto(base + '/#/');
  await page.locator('.react-flow__node').first().waitFor();
  await page.screenshot({ path: resolve(project, 'marmerlade-output/live-workspace.png'), animations: 'disabled' });
  assert.deepEqual(errors, []);
  const animation = await context.newPage();
  await animation.goto(pathToFileURL(evidence.gif_attempts.at(-1).job.file).href);
  await animation.locator('img').waitFor();
  await animation.waitForFunction(() => document.querySelector('img')?.naturalWidth === 1200);
  const early = await animation.screenshot({ path: resolve(project, 'marmerlade-output/gif-playback-early.png') });
  await animation.waitForTimeout(3500);
  const middle = await animation.screenshot({ path: resolve(project, 'marmerlade-output/gif-playback-middle.png') });
  await animation.waitForTimeout(4200);
  const nextLoop = await animation.screenshot({ path: resolve(project, 'marmerlade-output/gif-playback-next-loop.png') });
  assert.ok(!early.equals(middle));
  assert.ok(!middle.equals(nextLoop));
  const result = {
    passed: true,
    workspace_url: base + '/#/',
    source: 'Existing MCP-owned live app. No additional server.',
    wiki_link_clicks: ['overview to setup', 'geometry_map to geometry'],
    deck_to_wiki_click: 'briefing slide 5 to verification',
    diagram_embed_visible: true,
    page_errors: errors,
    earlier_check_attempts: ['The first run expected the page title to be a heading in the default Edit view.', 'The second run used a button locator for Read, whose accessible role is tab.', 'The third run selected Read but still expected a title heading. The title is a textbox in both modes.', 'The fourth run expected the slide wiki link to navigate the same page. It opens a wiki window. The final check waits for that window. These were check-locator errors, not native rendering failures.'],
    appearance: 'halloween in this isolated browser context',
    gif_browser_decode: true,
    gif_playback_observation_ms: 7700,
    gif_changed_between_captures: true,
    gif_loop_duration_ms: 7000,
    screenshot: resolve(project, 'marmerlade-output/live-workspace.png')
  };
  await writeFile(resolve(agent, 'browser-checks.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
