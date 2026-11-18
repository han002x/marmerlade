import { test, expect } from '@playwright/test';

test('G groups and ungroups selected nodes, and undo restores the group', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 3, diagram: {
      nodes: [
        { id: 'a', label: 'Alpha', shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 } },
        { id: 'b', label: 'Beta', shape: 'rect', parentId: null, collapsed: false, position: { x: 250, y: 0 } },
      ], edges: [],
    } }));
  });
  await page.goto('/');
  await page.locator('.mf-node').filter({ hasText: 'Alpha' }).click();
  await page.locator('.mf-node').filter({ hasText: 'Beta' }).click({ modifiers: ['ControlOrMeta'] });
  await page.keyboard.press('g');
  await expect(page.locator('.mf-sheet')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Ungroup' })).toBeVisible();
  await page.keyboard.press('g');
  await expect(page.locator('.mf-sheet')).toHaveCount(0);
  await expect(page.locator('.mf-node')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.mf-sheet')).toHaveCount(1);
});

test('ungrouping a folded group preserves its label and connections', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 3, diagram: {
      nodes: [
        { id: 'group', label: 'Service', shape: 'rect', parentId: null, collapsed: true, position: { x: 0, y: 0 } },
        { id: 'a', label: 'Alpha', shape: 'rect', parentId: 'group', collapsed: false, position: { x: 0, y: 0 } },
        { id: 'b', label: 'Beta', shape: 'rect', parentId: 'group', collapsed: false, position: { x: 250, y: 0 } },
        { id: 'c', label: 'Outside', shape: 'rect', parentId: null, collapsed: false, position: { x: 500, y: 0 } },
      ], edges: [{ id: 'e', source: 'group', target: 'c' }],
    } }));
  });
  await page.goto('/');
  await page.locator('.mf-node').filter({ hasText: 'Service' }).click();
  await page.keyboard.press('g');
  await expect(page.locator('.mf-node')).toHaveCount(4);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.locator('.mf-sheet')).toHaveCount(0);
});
