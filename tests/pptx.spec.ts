import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { test, expect, type Page } from '@playwright/test';

const node = (id: string, x: number, extra = {}) => ({ id, label: id, shape: 'rect', parentId: null, collapsed: false, position: { x, y: 0 }, ...extra });

async function seed(page: Page, diagram: object) {
  await page.addInitScript((diagram) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('marmerlade.welcomed', '1');
    localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 4, diagram }));
  }, diagram);
  await page.goto('/');
}

async function exportPowerPoint(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PowerPoint' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('diagram.pptx');
  return JSZip.loadAsync(await readFile((await file.path())!));
}

test('Export PowerPoint writes the folded view as editable shapes', async ({ page }) => {
  await seed(page, {
    nodes: [node('Start', 0), node('Group', 300, { collapsed: true }), node('Inner', 300, { parentId: 'Group' }), node('Done', 600), node('Db', 900, { icon: 'lucide:database', shape: 'round' })],
    edges: [
      { id: 'e1', source: 'Start', target: 'Inner', label: 'go', style: { arrowheads: 'end' } },
      { id: 'e2', source: 'Inner', target: 'Done' },
    ],
  });
  await expect(page.locator('.react-flow__node-diagram[data-id="Group"]')).toBeVisible();
  await expect(page.locator('.react-flow__node-diagram[data-id="Inner"]')).toHaveCount(0);
  const zip = await exportPowerPoint(page);
  const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(1);
  for (const text of ['Start', 'Group', 'Done', 'go']) expect(slide).toContain(`>${text}<`);
  expect(slide).not.toContain('>Inner<');
  expect(slide.match(/prst="line"/g)).toHaveLength(2);
  expect(slide).toContain('<a:tailEnd type="triangle"');
  // the icon is rasterized into a picture
  expect(slide.match(/<p:pic>/g)).toHaveLength(1);
  expect(Object.keys(zip.files).some((n) => n.startsWith('ppt/media/'))).toBe(true);
});

test('Export PowerPoint puts a sequence diagram on one slide as a picture', async ({ page }) => {
  await seed(page, { nodes: [], edges: [], sequence: 'sequenceDiagram\n  participant A as Alice\n  participant B\n  A->>B: Hi' });
  await page.locator('[data-diagram-id]').filter({ hasText: /Alice/ }).first().click();
  await expect(page.locator('.sq-drawing svg').first()).toBeVisible();
  const zip = await exportPowerPoint(page);
  const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(slide.match(/<p:pic>/g)).toHaveLength(1);
  expect(Object.keys(zip.files).some((n) => n.startsWith('ppt/media/'))).toBe(true);
});
