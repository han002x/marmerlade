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

const source = 'sequenceDiagram\n  participant A as Alice\n  A->>B: hello';

async function seed(page: Page) {
  await page.addInitScript((source) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 5, diagram: {
      diagrams: [
        { id: 'flow', title: 'Checkout', kind: 'flowchart', position: { x: 0, y: 0 }, size: { width: 900, height: 650 }, nodes: [], edges: [] },
        { id: 'seq', title: 'Login', kind: 'sequence', position: { x: 1020, y: 0 }, size: { width: 900, height: 650 }, source },
      ],
      nodes: [], edges: [], sequence: source,
      pages: [],
      decks: [{ id: 'd', title: 'Q3 Review', body: '# Kickoff', updatedAt: 1 }],
    } }));
  }, source);
  await page.goto('/');
  await page.locator('[data-diagram-id="seq"]').click();
}
const links = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('marmerlade.diagram') ?? '{}').diagram?.diagrams
    ?.find((d: { id: string }) => d.id === 'seq')?.links);

test('sequence participants link wiki pages and slide decks like flowchart nodes', async ({ page }) => {
  await seed(page);
  const alice = page.locator('.react-flow__node[data-id="actor:A"]');
  await alice.hover();
  const pageButton = alice.getByRole('button', { name: 'Open page' });
  await expect(pageButton).toBeVisible();
  await pageButton.click();

  // the page tab follows the participant: write its page
  const dock = page.locator('#mf-view-page');
  await dock.getByRole('button', { name: 'New page' }).click();
  await expect(dock.getByLabel('Page title')).toHaveValue('Alice');
  await expect(alice).toHaveClass(/selected/);
  await expect(pageButton).toHaveClass(/has-page/);
  await expect.poll(async () => (await links(page))?.A?.pageIds?.length).toBe(1);

  // another participant has nothing linked yet
  await page.locator('.react-flow__node[data-id="actor:B"]').click();
  await expect(dock.getByRole('button', { name: 'New page' })).toBeVisible();

  // K opens the slides tab on the participant; link an existing deck
  await alice.click();
  await page.keyboard.press('k');
  const slides = page.locator('#mf-view-slides');
  await slides.getByRole('button', { name: 'Q3 Review' }).click();
  await expect(slides.getByLabel('Deck title')).toHaveValue('Q3 Review');
  await expect.poll(async () => (await links(page))?.A?.deckIds).toEqual(['d']);

  // the links survive a reload
  await page.reload();
  await page.locator('[data-diagram-id="seq"]').click();
  await expect(page.locator('.react-flow__node[data-id="actor:A"] .mf-deck')).toHaveClass(/has-page/);
  await page.locator('.react-flow__node[data-id="actor:A"]').click();
  await page.keyboard.press('w');
  await expect(page.locator('#mf-view-page').getByLabel('Page title')).toHaveValue('Alice');
});
