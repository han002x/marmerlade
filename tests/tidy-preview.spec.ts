import { test, expect, type Page } from '@playwright/test';

// A pasted flowchart is tidied into the layout its preview shows, so opening a
// diagram looks like the diagram did on the board.
const source = [
  'flowchart LR',
  '  user([User]) -->|HTTPS| lb{Balancer}',
  '  subgraph web [Web]',
  '    w1[Web 1]',
  '    w2[Web 2]',
  '  end',
  '  lb --> w1',
  '  lb -->|spare| w2',
  '  w1 --> db[(Database)]',
  '  w2 --> db',
  '  db -.->|replicate| replica[(Replica)]',
  '  replica --> lb',
].join('\n');
const ids = ['user', 'lb', 'w1', 'w2', 'db', 'replica'];

type Centres = Record<string, { x: number; y: number }>;

/** Centres scaled to a common frame: centred on their mean, unit RMS spread. */
function normalise(c: Centres): Centres {
  const pts = ids.map((id) => c[id]);
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const rms = Math.sqrt(pts.reduce((s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / pts.length);
  return Object.fromEntries(ids.map((id) => [id, { x: (c[id].x - mx) / rms, y: (c[id].y - my) / rms }]));
}

async function editorCentres(page: Page): Promise<Centres> {
  return page.evaluate((ids) => {
    const out: Record<string, { x: number; y: number }> = {};
    for (const id of ids) {
      const r = document.querySelector(`.diagram-editor .react-flow__node[data-id="${id}"]`)!.getBoundingClientRect();
      out[id] = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return out;
  }, ids);
}

async function previewCentres(page: Page): Promise<Centres> {
  return page.evaluate((ids) => {
    const out: Record<string, { x: number; y: number }> = {};
    for (const g of document.querySelectorAll('.diagram-preview svg :is(g.node, g.rough-node)[id]')) {
      const id = g.id.match(/-flowchart-(.+)-\d+$/)?.[1];
      if (!id || !ids.includes(id)) continue;
      const r = g.getBoundingClientRect();
      out[id] = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return out;
  }, ids);
}

test('a pasted flowchart opens laid out as its preview shows it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /paste mermaid/i }).first().click();
  const box = page.locator('.mf-mermaid-text').first();
  await box.focus();
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  }, source);
  await expect(page.locator('.diagram-editor .react-flow__node[data-id="replica"]')).toBeVisible();
  await expect(box).toHaveValue(/^flowchart LR/);
  // the preview layout lands once Mermaid has drawn: nodes then take its sizes
  await expect(page.locator('.diagram-editor .react-flow__node[data-id="user"] .mf-node.is-sized')).toBeVisible();
  const editor = normalise(await editorCentres(page));

  // close the diagram: the board draws its preview
  await page.mouse.click(40, 500);
  await expect(page.locator('.diagram-preview svg')).toBeVisible();
  await expect.poll(async () => Object.keys(await previewCentres(page)).length).toBe(ids.length);
  const preview = normalise(await previewCentres(page));

  for (const id of ids) {
    expect(Math.abs(editor[id].x - preview[id].x), `${id} x`).toBeLessThan(0.05);
    expect(Math.abs(editor[id].y - preview[id].y), `${id} y`).toBeLessThan(0.05);
  }
});
