import { test, expect, type Page } from '@playwright/test';

const source = 'sequenceDiagram\n  participant A as Alice\n  participant B\n  A->>B: Hi\n  B->>A: Yo';

async function clickCenter(page: Page, box: { x: number; y: number; width: number; height: number } | null) {
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

test('sequence elements take styles that follow edits, undo, save and the preview', async ({ page }) => {
  await page.addInitScript((sequence) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 4, diagram: { nodes: [], edges: [], sequence } }));
  }, source);
  await page.goto('/');
  await page.locator('[data-diagram-id]').filter({ hasText: /Alice/ }).first().click();
  const drawing = page.locator('.sq-drawing svg').first();
  const alice = drawing.locator('[data-et="participant"][data-id="A"] rect');
  const panel = page.locator('.mf-style-panel');
  const style = panel.locator('.sq-style-fields');

  await clickCenter(page, await alice.boundingBox());
  await style.getByRole('button', { name: 'Background #f6d6cf' }).click();
  await expect(alice).toHaveCSS('fill', 'rgb(246, 214, 207)');

  // A message has no background, and its arrowhead takes the stroke color.
  await clickCenter(page, await drawing.locator('.messageText').filter({ hasText: 'Hi' }).boundingBox());
  await expect(style.getByText('Background')).toHaveCount(0);
  await style.getByRole('button', { name: 'Stroke #c8442b' }).click();
  const hi = drawing.locator('[data-et="message"]').first();
  await expect(hi).toHaveCSS('stroke', 'rgb(200, 68, 43)');
  await expect(hi).toHaveAttribute('marker-end', /-sq-\d+\)$/);

  // Moving the message below the reply keeps its style on it.
  await panel.getByRole('button', { name: 'Move down' }).click();
  await expect(drawing.locator('[data-et="message"]').nth(1)).toHaveCSS('stroke', 'rgb(200, 68, 43)');
  await expect(drawing.locator('[data-et="message"]').nth(0)).not.toHaveCSS('stroke', 'rgb(200, 68, 43)');

  // Undo restores the move, then removes the stroke.
  await page.mouse.click(5, 400);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(drawing.locator('[data-et="message"]').first()).toHaveCSS('stroke', 'rgb(200, 68, 43)');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(drawing.locator('[data-et="message"]').first()).not.toHaveCSS('stroke', 'rgb(200, 68, 43)');

  await expect
    .poll(async () => {
      const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('marmerlade.diagram')))!);
      return saved.diagram.diagrams?.find((d: { kind: string }) => d.kind === 'sequence')?.styles;
    })
    .toEqual({ 'p:A': { background: '#f6d6cf' } });

  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('.diagram-preview [data-et="participant"][data-id="A"] rect')).toHaveCSS(
    'fill',
    'rgb(246, 214, 207)',
  );
});

test('sequence elements take the flowchart sloppiness and animation presets', async ({ page }) => {
  await page.addInitScript((sequence) => {
    localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 4, diagram: { nodes: [], edges: [], sequence } }));
  }, source);
  await page.goto('/');
  await page.locator('[data-diagram-id]').filter({ hasText: /Alice/ }).first().click();
  const drawing = page.locator('.sq-drawing svg').first();
  const header = drawing.locator('[data-et="participant"][data-id="A"]');
  const style = page.locator('.mf-style-panel .sq-style-fields');

  await clickCenter(page, await header.locator('rect').boundingBox());
  await expect(style.locator('button[title="Ink"]')).toHaveClass(/active/);
  await style.locator('button[title="Scribble"]').click();
  // The outline is re-drawn as ink over the clean fill.
  await expect(header.locator('path[data-sq-ink]')).toHaveCount(1);
  await expect(header.locator('rect')).toHaveCSS('stroke', 'rgba(0, 0, 0, 0)');
  // Participants get the node presets.
  await expect(style.getByRole('button', { name: 'Animation Pulse' })).toBeVisible();
  await style.getByRole('button', { name: 'Animation Pulse' }).click();
  await expect(header).toHaveCSS('animation-name', 'mf-outline-pulse');

  // Messages get the edge presets, like flowchart edges.
  await clickCenter(page, await drawing.locator('.messageText').filter({ hasText: 'Hi' }).boundingBox());
  await expect(style.getByRole('button', { name: 'Animation Pulse' })).toHaveCount(0);
  await style.locator('button[title="Sketch"]').click();
  await style.getByRole('button', { name: 'Animation Flow' }).click();
  const ink = drawing.locator('path[data-sq-ink][data-sq-shape="flow"]');
  await expect(ink).toHaveCount(1);
  await expect(ink).toHaveCSS('animation-name', 'mf-anim-flow');
  await expect(ink).toHaveAttribute('marker-end', /arrowhead/);
  await page.screenshot({ path: '/tmp/claude-1000/-home-han-projects-marmerlade/8b0b38f9-5ca9-4fdc-9b17-cbb5bc24cdaf/scratchpad/anim.png' });

  // Back to no animation and clean ink restores Mermaid's own line.
  await style.getByRole('button', { name: 'Animation None' }).click();
  await style.locator('button[title="Ink"]').click();
  // Only Alice stays inked: her header, lifeline and footer.
  await expect(drawing.locator('[data-sq-ink]')).toHaveCount(3);
  await expect(drawing.locator('[data-et="message"]').first()).toHaveAttribute('marker-end', /arrowhead\)$/);
});
