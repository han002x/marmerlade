import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const directory = dirname(fileURLToPath(import.meta.url));
const url = process.argv[2];
assert(url, 'Pass the running standalone workspace URL');
const file = process.argv[3] ?? join(directory, 'project/xray-dir.marmerlade.json');
const before = await readFile(file, 'utf8');
const screenshots = join(directory, 'ui-audit');
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1800, height: 1800 } });
await context.addInitScript(() => {
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    localStorage.setItem('marmerlade.appearance', JSON.stringify({ selected: 'halloween', custom: null }));
  }
});
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
const page = await context.newPage();
const captures = [];
async function capture(target, name) {
  const path = join(screenshots, name + '.png');
  await target.screenshot({ path, animations: 'disabled' });
  captures.push(path);
}
try {
  await page.goto(url);
  const reviewer = page.locator('.react-flow__node[data-id="reviewer"]');
  await expect(reviewer).toBeVisible();
  const geometrySheet = page.locator('.react-flow__node[data-id="__sheet__geometry"]');
  if (await geometrySheet.count()) await geometrySheet.getByRole('button', { name: 'Fold', exact: true }).click();
  await expect(page.locator('.react-flow__node[data-id="geometry"]')).toBeVisible();
  await capture(page, '01-saved-starting-view');

  await page.locator('.react-flow__node[data-id="geometry"]').getByRole('button', { name: /^Unfold/ }).click();
  await expect(page.locator('.react-flow__node[data-id="anchor"]')).toBeVisible();
  await capture(page, '02-drill-down');
  await page.locator('.react-flow__node[data-id="__sheet__geometry"]').getByRole('button', { name: 'Fold', exact: true }).click();
  await expect(page.locator('.react-flow__node[data-id="anchor"]')).toHaveCount(0);
  await expect(page.locator('.react-flow__node[data-id="geometry"]')).toBeVisible();

  await reviewer.hover();
  await reviewer.getByRole('button', { name: 'Open page', exact: true }).click();
  await expect(page.getByLabel('Page title', { exact: true })).toHaveValue('Xray DIR today');
  await page.getByRole('tab', { name: 'Read', exact: true }).click();
  await capture(page, '03-diagram-linked-wiki');
  await page.locator('.wk-dock').getByRole('link', { name: 'Geometry review decisions', exact: true }).click();
  await expect(page.getByLabel('Page title', { exact: true })).toHaveValue('Geometry review decisions');
  const wikiPromise = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Open in wiki', exact: true }).click();
  const wiki = await wikiPromise;
  await expect(wiki).toHaveURL(/#\/wiki\/geometry/);
  await wiki.getByRole('tab', { name: 'Read', exact: true }).click();
  await expect(wiki.getByLabel('Page title', { exact: true })).toHaveValue('Geometry review decisions');
  await expect(wiki.getByRole('heading', { name: 'Distance and decisions', exact: true })).toBeVisible();
  await capture(wiki, '04-wiki-window');

  await page.goto(url.replace(/\/$/, '') + '/#/node/reviewer');
  await expect(reviewer).toBeVisible();
  await reviewer.hover();
  await reviewer.getByRole('button', { name: 'Open slides', exact: true }).click();
  await expect(page.getByLabel('Deck title', { exact: true })).toHaveValue('Xray DIR reviewer briefing');
  await capture(page, '05-diagram-linked-slides');
  const slidesPromise = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Open in slides', exact: true }).click();
  const slides = await slidesPromise;
  await expect(slides).toHaveURL(/#\/slides\/briefing/);
  await slides.getByRole('link', { name: 'Present', exact: true }).click();
  await expect(slides.getByLabel('Slide number', { exact: true })).toHaveText('1 / 5');
  await slides.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(slides.getByLabel('Slide number', { exact: true })).toHaveText('2 / 5');
  await expect(slides.getByRole('heading', { name: 'Freeze the right sources', exact: true })).toBeVisible();
  await capture(slides, '06-presentation-navigation');
  assert.deepEqual(errors, [], 'Browser must not report runtime errors');
} finally {
  await browser.close();
}
const after = await readFile(file, 'utf8');
const content = raw => {
  const workspace = JSON.parse(raw);
  workspace.diagram.nodes = workspace.diagram.nodes.map(({ collapsed: _collapsed, ...node }) => node);
  return workspace;
};
assert.deepEqual(content(after), content(before), 'Navigation must preserve diagram content and document links');
const starting = JSON.parse(before).diagram.nodes;
const foldChanges = JSON.parse(after).diagram.nodes.filter(node => starting.find(prior => prior.id === node.id)?.collapsed !== node.collapsed).map(node => node.id);
const report = { status: 'passed', url, workspace: file, checks: ['saved workspace loads', 'geometry unfolds and folds', 'node opens its linked wiki', 'wikilink navigates', 'wiki opens in its own window', 'node opens its linked deck', 'deck opens and advances in Present view', 'diagram content and document links preserved'], foldChanges, errors, captures };
await writeFile(join(directory, 'independent-ui-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
