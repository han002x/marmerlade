import { test, expect, type Page } from '@playwright/test';

const node = (id: string, label: string, x: number, y: number) =>
  ({ id, label, shape: 'rect', parentId: null, collapsed: false, position: { x, y } });

/** Where the edge's drawn path starts and ends, in page pixels. */
async function ends(page: Page) {
  return page.locator('.react-flow__edge .react-flow__edge-path').first().evaluate((path: SVGPathElement) => {
    const m = path.getScreenCTM()!;
    const at = (l: number) => path.getPointAtLength(l).matrixTransform(m);
    const a = at(0);
    const b = at(path.getTotalLength());
    return { start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y } };
  });
}

async function boxOf(page: Page, label: string) {
  return (await page.locator('.mf-node').filter({ hasText: label }).boundingBox())!;
}

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(10);

test.beforeEach(async ({ page }) => {
  await page.addInitScript((nodes) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 3, diagram: {
      nodes, edges: [{ id: 'e', source: 'a', target: 'b' }],
    } }));
  }, [node('a', 'Alpha', 0, 0), node('b', 'Beta', 400, 0), node('c', 'Gamma', 400, 250)]);
  await page.goto('/');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
});

test('an unpinned edge joins the sides that face each other', async ({ page }) => {
  const a = await boxOf(page, 'Alpha');
  const b = await boxOf(page, 'Beta');
  const { start, end } = await ends(page);
  near(start.x, a.x + a.width);
  near(start.y, a.y + a.height / 2);
  near(end.x, b.x);
  near(end.y, b.y + b.height / 2);
});

test('the style panel pins and unpins an end', async ({ page }) => {
  const { start, end } = await ends(page);
  await page.mouse.click((start.x + end.x) / 2, (start.y + end.y) / 2);
  await expect(page.locator('.react-flow__edgeupdater')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Leaves auto' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Leaves top' }).click();
  const a = await boxOf(page, 'Alpha');
  const pinned = await ends(page);
  near(pinned.start.x, a.x + a.width / 2);
  near(pinned.start.y, a.y);
  await expect(page.locator('.react-flow__edge.mf-pin-source')).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+z');
  near((await ends(page)).start.x, a.x + a.width);
});

test("dragging an end's grip pins a side or moves it to another node", async ({ page }) => {
  const { start, end } = await ends(page);
  await page.mouse.click((start.x + end.x) / 2, (start.y + end.y) / 2);
  await expect(page.locator('.react-flow__edgeupdater-target')).toHaveCount(1);

  // the target grip onto Beta's bottom handle
  const b = await boxOf(page, 'Beta');
  await page.mouse.move(end.x, end.y);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height + 20, { steps: 6 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height, { steps: 4 });
  await page.mouse.up();
  const pinned = await ends(page);
  expect(await boxOf(page, 'Beta')).toEqual(b); // the grip moved, not the node
  near(pinned.end.x, b.x + b.width / 2);
  near(pinned.end.y, b.y + b.height);

  // then onto Gamma's top handle: the edge now runs Alpha → Gamma
  await page.mouse.click((pinned.start.x + pinned.end.x) / 2, (pinned.start.y + pinned.end.y) / 2);
  const c = await boxOf(page, 'Gamma');
  await page.mouse.move(pinned.end.x, pinned.end.y);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2, c.y - 20, { steps: 6 });
  await page.mouse.move(c.x + c.width / 2, c.y, { steps: 4 });
  await page.mouse.up();
  const moved = await ends(page);
  expect(await boxOf(page, 'Gamma')).toEqual(c);
  expect(await boxOf(page, 'Beta')).toEqual(b);
  near(moved.end.x, c.x + c.width / 2);
  near(moved.end.y, c.y);
});
