import { test, expect } from '@playwright/test';

const sequence = 'sequenceDiagram\n  participant A as Alice\n  participant B\n  A->>B: Hi';

test('a dragged diagram snaps to the other diagrams and shows a guide', async ({ page }) => {
  await page.addInitScript((sequence) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 4, diagram: { nodes: [], edges: [], sequence } }));
  }, sequence);
  await page.goto('/');
  const diagrams = page.locator('.react-flow__node-diagram');
  await expect(diagrams).toHaveCount(2);
  const [a, b] = [(await diagrams.nth(0).boundingBox())!, (await diagrams.nth(1).boundingBox())!];
  const [still, moved] = a.x < b.x ? [a, b] : [b, a];
  const handle = diagrams.nth(a.x < b.x ? 1 : 0);

  // Grab the moving diagram by its title bar and bring its top within a few pixels of the other one's.
  const grab = { x: moved.x + moved.width / 2, y: moved.y + 12 };
  const target = { x: grab.x + 40, y: grab.y + (still.y - moved.y) + 3 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move((grab.x + target.x) / 2, (grab.y + target.y) / 2, { steps: 5 });
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await expect(page.locator('.mf-snap-guide')).not.toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator('.mf-snap-guide')).toHaveCount(0);

  const after = (await handle.boundingBox())!;
  expect(Math.abs(after.y - still.y)).toBeLessThan(0.5);
});
