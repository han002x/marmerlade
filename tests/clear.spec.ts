import { test, expect, type Page } from '@playwright/test';

const sequence = 'sequenceDiagram\n  participant A as Alice\n  participant B\n  A->>B: Hi';

async function seed(page: Page) {
  await page.addInitScript((sequence) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('marmerlade.welcomed', '1');
    localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 4, diagram: {
      nodes: [{ id: 'a', label: 'API', shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 } }],
      edges: [],
      sequence,
      pages: [{ id: 'p', title: 'Notes', body: '# Notes', updatedAt: 1 }],
    } }));
  }, sequence);
  await page.goto('/');
}

test('Clear canvas removes every diagram, keeps pages, and persists', async ({ page }) => {
  await seed(page);
  const diagrams = page.getByRole('button', { name: /^(Expand|Collapse) diagram / });
  await expect(diagrams).toHaveCount(2);

  // A flowchart opens by default; its menu carries the workspace's Clear canvas.
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Clear canvas', exact: true }).click();
  await expect(diagrams).toHaveCount(0);
  await expect(page.locator('.react-flow__node-diagram')).toHaveCount(0);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('marmerlade.diagram')!).diagram);
  expect(saved.diagrams).toEqual([]);
  expect(saved.pages.map((p: { id: string }) => p.id)).toEqual(['p']);

  await page.reload();
  await expect(diagrams).toHaveCount(0);
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Clear canvas', exact: true })).toBeDisabled();
});

test('Clear canvas from the board menu is undoable', async ({ page }) => {
  await seed(page);
  const diagrams = page.getByRole('button', { name: /^(Expand|Collapse) diagram / });
  await expect(diagrams).toHaveCount(2);
  // open the sequence so the board's own menu is the one shown
  await page.getByRole('button', { name: 'Expand diagram Sequence' }).click();
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Clear canvas', exact: true }).click();
  await expect(diagrams).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(diagrams).toHaveCount(2);
});
