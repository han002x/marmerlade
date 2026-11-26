import { expect, test, type Page } from '@playwright/test';

const node = (id: string, label: string, x: number, y = 100, parentId: string | null = null, collapsed = false) =>
  ({ id, label, shape: 'rect', parentId, collapsed, position: { x, y } });
const arrow = (id: string, source: string, target: string, order?: number) =>
  ({ id, source, target, order, style: { arrowheads: 'end' } });

async function seed(page: Page, nodes: ReturnType<typeof node>[], edges: ReturnType<typeof arrow>[]) {
  await page.addInitScript((diagram) => {
    if (localStorage.getItem('marmerlade.diagram')) return;
    localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 3, diagram }));
  }, { nodes, edges });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play flow', exact: true })).toBeEnabled();
}

async function orderMode(page: Page) {
  await page.getByRole('button', { name: 'Play flow', exact: true }).click();
  await page.getByRole('button', { name: 'Edit flow order', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Done editing flow order' })).toBeVisible();
}

const badge = (page: Page, id: string) => page.locator(`[data-flow-edge-id="${id}"]`);

async function setStep(page: Page, id: string, value: string) {
  await badge(page, id).click();
  const field = badge(page, id);
  await expect(field).toHaveRole('textbox');
  await field.fill(value);
  await field.press('Enter');
  await expect(badge(page, id)).toHaveRole('button');
}

async function expectTraces(page: Page, expected: Record<string, number>) {
  await expect.poll(() => page.locator('.mf-flow-trace').evaluateAll((paths) =>
    Object.fromEntries(paths.map((path) => [
      path.closest('.react-flow__edge')?.getAttribute('data-id'),
      Number.parseFloat(getComputedStyle(path).strokeDashoffset.replace('calc(', '')),
    ])),
  )).toEqual(expected);
}

test('arrow numbers control playback steps and survive reload and undo', async ({ page }) => {
  await seed(page, [node('a', 'Alpha', 0), node('b', 'Beta', 220), node('c', 'Gamma', 440), node('d', 'Delta', 660)],
    [arrow('ab', 'a', 'b'), arrow('bc', 'b', 'c'), arrow('cd', 'c', 'd')]);

  await orderMode(page);
  await expect(page.locator('.mf-flow-order-badge')).toHaveText(['1', '2', '3']);
  await setStep(page, 'ab', '3');
  await setStep(page, 'bc', '1');
  await expect(page.locator('.mf-flow-order-badge')).toHaveText(['3', '1', '3']);
  await expect(badge(page, 'ab')).toHaveAccessibleName('Flow step for Alpha to Beta: 3 (manual)');
  await expect(badge(page, 'cd')).toHaveAccessibleName('Flow step for Gamma to Delta: 3 (automatic)');

  await page.getByRole('button', { name: 'Done editing flow order' }).click();
  await expect(page.locator('.mf-flow-order-badge')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next step' }).click();
  await expectTraces(page, { ab: 1, bc: 0, cd: 1 });
  await page.getByRole('button', { name: 'Next step' }).click();
  await expectTraces(page, { ab: 1, bc: 0, cd: 1 });
  await page.getByRole('button', { name: 'Next step' }).click();
  await expectTraces(page, { ab: 0, bc: 0, cd: 0 });
  await page.getByRole('button', { name: 'Previous step' }).click();
  await expectTraces(page, { ab: 1, bc: 0, cd: 1 });

  await page.getByRole('button', { name: 'Edit flow order' }).click();
  await setStep(page, 'bc', '');
  await expect(badge(page, 'bc')).toHaveAccessibleName('Flow step for Beta to Gamma: 2 (automatic)');
  await page.getByRole('button', { name: 'Done editing flow order' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await orderMode(page);
  await expect(badge(page, 'bc')).toHaveText('1');
  await expect(badge(page, 'bc')).toHaveAccessibleName('Flow step for Beta to Gamma: 1 (manual)');
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('marmerlade.diagram') ?? '{}').diagram;
    const edges = saved?.diagrams?.find((d: { kind: string }) => d.kind === 'flowchart')?.edges ?? saved?.edges;
    return edges?.map((e: { order?: number }) => e.order ?? null);
  })).toEqual([3, 1, null]);
  await page.reload();
  await orderMode(page);
  await expect(page.locator('.mf-flow-order-badge')).toHaveText(['3', '1', '3']);
  await page.getByRole('button', { name: 'Open Mermaid panel' }).click();
  await page.getByRole('tab', { name: 'Mermaid', exact: true }).click();
  const source = page.getByRole('textbox', { name: 'Mermaid source' });
  await source.fill((await source.inputValue()).replace('Alpha', 'Renamed'));
  await expect(page.getByRole('button', { name: 'Flow step for Renamed to Beta: 3 (manual)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Flow step for Beta to Gamma: 1 (manual)' })).toBeVisible();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Done editing flow order' }).click();
  await page.keyboard.press('p');
  await expect(page.locator('.mf-flow-order-badge')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause flow' })).toBeVisible();
});

test('folded creases show automatic steps and preserve the hidden manual order', async ({ page }) => {
  await seed(page, [
    node('a', 'Alpha', 0), node('g', 'Service', 260, 100, null, true),
    node('b', 'Beta', 260, 100, 'g'), node('c', 'Gamma', 500, 100, 'g'),
  ], [arrow('ab', 'a', 'b', 3), arrow('bc', 'b', 'c')]);
  await orderMode(page);
  await expect(badge(page, 'fold:a->g')).toHaveText('1');
  await expect(badge(page, 'fold:a->g')).not.toHaveRole('button');
  await page.getByRole('button', { name: 'Unfold Service' }).click();
  await expect(badge(page, 'ab')).toHaveAccessibleName('Flow step for Alpha to Beta: 3 (manual)');
  await expect(badge(page, 'bc')).toHaveText('2');
  await badge(page, 'bc').click();
  await badge(page, 'bc').fill('-1');
  await expect(badge(page, 'bc')).toHaveAttribute('aria-invalid', 'true');
  await badge(page, 'bc').press('Escape');
  await expect(page.locator('.mf-flow-order-badge')).toHaveCount(0);
  await orderMode(page);
  await badge(page, 'bc').click();
  await badge(page, 'bc').fill('5');
  await badge(page, 'bc').press('Escape');
  await expect(page.locator('.mf-flow-order-badge')).toHaveCount(0);
  await orderMode(page);
  await expect(badge(page, 'bc')).toHaveText('2');
  await badge(page, 'bc').click();
  await badge(page, 'bc').fill('4');
  await page.getByRole('button', { name: 'Done editing flow order' }).click();
  await expect(page.locator('.mf-flow-order-badge')).toHaveCount(0);
  await orderMode(page);
  await expect(badge(page, 'bc')).toHaveAccessibleName('Flow step for Beta to Gamma: 4 (manual)');
});

test('zero excludes arrows, and tick applies or Escape and cross discard the entire draft', async ({ page }) => {
  await seed(page, [node('a', 'Alpha', 0), node('b', 'Beta', 240), node('c', 'Gamma', 480)],
    [arrow('ab', 'a', 'b'), arrow('bc', 'b', 'c')]);
  await orderMode(page);
  await expect(page.getByText('0 = not in use. Clear for automatic.')).toBeVisible();
  await setStep(page, 'ab', '0');
  await expect(badge(page, 'ab')).toHaveAccessibleName('Flow step for Alpha to Beta: 0 (not in use)');
  await expect(badge(page, 'bc')).toHaveText('1');
  await badge(page, 'bc').click();
  await badge(page, 'bc').fill('7');
  await badge(page, 'bc').press('Escape');
  await expect(page.locator('.mf-flow-order-badge')).toHaveCount(0);
  await orderMode(page);
  await expect(page.locator('.mf-flow-order-badge')).toHaveText(['1', '2']);

  await setStep(page, 'ab', '0');
  await setStep(page, 'bc', '5');
  await page.getByRole('button', { name: 'Cancel editing flow order' }).click();
  await orderMode(page);
  await expect(page.locator('.mf-flow-order-badge')).toHaveText(['1', '2']);
  await setStep(page, 'ab', '0');
  await setStep(page, 'bc', '0');
  await page.getByRole('button', { name: 'Done editing flow order' }).click();
  await expect(page.locator('.mf-flow-trace')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next step' })).toBeDisabled();
  await page.keyboard.press('ControlOrMeta+z');
  await orderMode(page);
  await expect(page.locator('.mf-flow-order-badge')).toHaveText(['1', '2']);

  await setStep(page, 'ab', '0');
  await setStep(page, 'bc', '0');
  await page.getByRole('button', { name: 'Done editing flow order' }).click();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('marmerlade.diagram') ?? '{}').diagram;
    return saved?.edges?.map((e: { order?: number }) => e.order);
  })).toEqual([0, 0]);
  await page.reload();
  await orderMode(page);
  await expect(page.locator('.mf-flow-order-badge')).toHaveText(['0', '0']);
  await setStep(page, 'bc', '');
  await expect(badge(page, 'bc')).toHaveText('1');
  await page.getByRole('button', { name: 'Done editing flow order' }).click();
  await page.getByRole('button', { name: 'Next step' }).click();
  await expectTraces(page, { bc: 0 });
});
