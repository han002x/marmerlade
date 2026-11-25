import { expect, test } from '@playwright/test';

test('a label and an opposite folded connection count do not overlap', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('marmerlade.welcomed', '1');
    localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 3, diagram: {
      nodes: [
        { id: 'a', label: 'Client', shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 } },
        { id: 'g', label: 'Service', shape: 'rect', parentId: null, collapsed: true, position: { x: 0, y: 300 } },
        { id: 'x', label: 'One', shape: 'rect', parentId: 'g', collapsed: false, position: { x: 0, y: 300 } },
        { id: 'y', label: 'Two', shape: 'rect', parentId: 'g', collapsed: false, position: { x: 100, y: 300 } },
      ],
      edges: [
        { id: 'direct', source: 'a', target: 'g', label: 'Authentication request' },
        { id: 'one', source: 'x', target: 'a' },
        { id: 'two', source: 'y', target: 'a' },
      ],
    } }));
  });
  await page.goto('/');
  const label = page.locator('.mf-edge-text', { hasText: 'Authentication request' });
  const count = page.locator('.mf-edge-text', { hasText: '×2' });
  await expect(label).toBeVisible();
  await expect(count).toBeVisible();
  const a = await label.boundingBox();
  const b = await count.boundingBox();
  expect(a && b && (a.y + a.height <= b.y || b.y + b.height <= a.y)).toBeTruthy();
});
