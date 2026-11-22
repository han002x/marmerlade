import { test as base, expect, type Page } from '@playwright/test';
const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await use(errors);
    expect(errors).toEqual([]);
  }, { auto: true }],
});

/** A page, a deck, and two diagrams on the canvas. */
async function seed(page: Page, body: string, hash: string, deckBody = '# Kickoff\n\nWelcome') {
  await page.addInitScript(({ body, deckBody }) => {
    const make = (id: string, label: string, extra = {}) =>
      ({ id, label, shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 }, ...extra });
    const checkout = [make('cart', 'Cart', { pageIds: ['p'] }), make('pay', 'Pay', { position: { x: 0, y: 160 } })];
    if (!localStorage.getItem('marmerlade.diagram')) localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 5, diagram: {
      diagrams: [
        { id: 'flow', title: 'Checkout', kind: 'flowchart', position: { x: 0, y: 0 }, size: { width: 900, height: 650 },
          nodes: checkout, edges: [{ id: 'e', source: 'cart', target: 'pay' }] },
        { id: 'seq', title: 'Login', kind: 'sequence', position: { x: 1020, y: 0 }, size: { width: 900, height: 650 },
          source: 'sequenceDiagram\n  Alice->>Bob: hello' },
      ],
      nodes: checkout, edges: [{ id: 'e', source: 'cart', target: 'pay' }],
      sequence: 'sequenceDiagram\n  Alice->>Bob: hello',
      pages: [{ id: 'p', title: 'Notes', body, updatedAt: 1 }, { id: 'other', title: 'Other', body: '# Other page\n\nDetails here', updatedAt: 1 }],
      decks: [{ id: 'd', title: 'Q3 Review', body: deckBody, updatedAt: 1 }],
    } }));
  }, { body, deckBody });
  await page.goto(hash);
}
const saved = (page: Page, list: 'pages' | 'decks', id: string) =>
  page.evaluate(({ list, id }) => JSON.parse(localStorage.getItem('marmerlade.diagram') ?? '{}').diagram?.[list].find((p: { id: string }) => p.id === id)?.body, { list, id });

test('[[ offers decks and diagrams with a preview, and / opens it filtered', async ({ page }) => {
  await seed(page, '', '/#/wiki/p');
  const content = page.getByLabel('Page content');
  await content.click();
  await page.keyboard.type('[[deck:');
  const option = page.getByRole('option', { name: 'Q3 Review', exact: true });
  await expect(option).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(1);
  // the highlighted option previews its first slide
  await expect(page.getByRole('tooltip').locator('.sl-slide')).toContainText('Kickoff');
  await page.keyboard.press('Enter');
  await expect(content.locator('[data-wikilink="deck:Q3 Review"]')).toHaveText('Q3 Review');

  await page.keyboard.press('Enter');
  await page.keyboard.type('/link dia');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox', { name: 'Wiki links' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Checkout', exact: true })).toBeVisible();
  await expect(page.getByRole('tooltip').locator('.ref-picture svg')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(content.locator('[data-wikilink="diagram:Checkout"]')).toBeVisible();

  await page.keyboard.press('Enter');
  await page.keyboard.type('/login');
  await page.getByRole('option', { name: 'Embed Login', exact: true }).click();
  await expect(page.locator('.wk-diagram-block [data-sequence="Login"] svg')).toContainText('Alice');
  await expect.poll(async () => (await saved(page, 'pages', 'p'))?.trim()).toBe('[[deck:Q3 Review]]\n\n[[diagram:Checkout]]\n\n{{sequence:Login}}');
});

test('rendered links preview on hover and open their kind', async ({ page }) => {
  await seed(page, 'See [[deck:Q3 Review|the review]], [[diagram:Checkout]], [[Other]] and [[deck:Gone]].\n\n{{diagram:Checkout}}', '/#/wiki/p');
  await page.getByRole('tab', { name: 'Read', exact: true }).click();
  const preview = page.locator('.wk-read .wk-preview');
  await expect(preview.locator('[data-embed="Checkout"] svg')).toContainText('Pay');
  await expect(preview.locator('.wl.missing')).toHaveText('Gone');

  await preview.getByRole('link', { name: 'Other' }).hover();
  await expect(page.getByRole('tooltip')).toContainText('Details here');
  await preview.getByRole('link', { name: 'Checkout' }).hover();
  await expect(page.getByRole('tooltip').locator('.ref-picture svg')).toContainText('Cart');
  await preview.getByRole('link', { name: 'the review' }).hover();
  await expect(page.getByRole('tooltip')).toContainText('1 slide');
  await expect(page.getByRole('tooltip').locator('.sl-slide')).toContainText('Kickoff');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);

  const popup = page.waitForEvent('popup');
  await preview.getByRole('link', { name: 'the review' }).click();
  await expect(await popup).toHaveURL(/#\/slides\/d$/);
});

test('#/diagrams/<id> opens that diagram, and renaming it keeps links', async ({ page }) => {
  await seed(page, '[[diagram:Login]]', '/#/diagrams/seq', '{{diagram:Login}}');
  await expect(page.locator('.react-flow, .sq-editor, [aria-label*="equence"]').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/diagrams/seq');
  const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('marmerlade.diagram') ?? '{}').diagram);
  await expect.poll(async () => (await store())?.diagrams?.length).toBe(2);
  // rename through the workspace tree
  const title = page.getByTitle('Double-click to rename').filter({ hasText: 'Login' });
  await title.dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Sign in');
  await page.keyboard.press('Enter');
  await expect.poll(() => saved(page, 'pages', 'p')).toBe('[[diagram:Sign in]]');
  await expect.poll(() => saved(page, 'decks', 'd')).toBe('{{diagram:Sign in}}');
});

test('slides: source / and [[ completions, and the diagram picker', async ({ page }) => {
  await seed(page, '', '/#/slides/d', '# One');
  await page.getByRole('tab', { name: 'Source', exact: true }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/embed');
  await page.getByRole('option', { name: /Embed diagram/ }).click();
  await expect(page.getByRole('option', { name: /Checkout/ })).toBeVisible();
  await page.getByRole('option', { name: /Checkout/ }).click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[[Oth');
  await expect(page.locator('.cm-completionInfo .ref-card')).toContainText('Details here');
  await page.keyboard.press('Enter');
  await expect.poll(() => saved(page, 'decks', 'd')).toBe('# One\n\n{{diagram:Checkout}}\n\n[[Other]]');
  await expect(page.getByRole('list', { name: 'Slides' }).locator('[data-embed="Checkout"] svg')).toContainText('Pay');

  await page.getByRole('button', { name: 'Diagram', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Login' }).click();
  await expect.poll(() => saved(page, 'decks', 'd')).toContain(`data-slide-diagram="Login"`);
  await expect(page.getByRole('list', { name: 'Slides' }).locator('.box.diagram svg')).toContainText('Alice');
});
