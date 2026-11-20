import { referencedActors, type Statement } from './model';

// Capture original SVG geometry once at pickup. Each frame is relative to that
// geometry, so reversing direction or cancelling never accumulates offsets.
export function sequenceDragPreview(
  svg: SVGSVGElement,
  rows: Statement[],
  actor?: string,
  messageStart?: number,
) {
  const updates: ((delta: number) => void)[] = [];
  function translate(element: Element, weight = 1) {
    const original = element.getAttribute('transform');
    updates.push((delta) => {
      if (delta) {
        const movement = actor ? [delta * weight, 0] : [0, delta];
        element.setAttribute('transform', 'translate(' + movement.join(' ') + ') ' + (original ?? ''));
      } else if (original === null) element.removeAttribute('transform');
      else element.setAttribute('transform', original);
    });
  }
  if (actor) {
    for (const part of svg.querySelectorAll('[data-sequence-actor]')) {
      if (part.getAttribute('data-sequence-actor') === actor) translate(part);
    }
  }
  const byStart = new Map(rows.map((row) => [row.start, row]));
  for (const el of svg.querySelectorAll('.messageText,[data-et="message"],[data-et="note"]')) {
    const row = byStart.get(Number(el.getAttribute('data-statement')));
    if (!row) continue;
    if (!actor) {
      if (row.start === messageStart) translate(el);
      continue;
    }
    const references = referencedActors(row);
    if (!references.includes(actor)) continue;
    if (el instanceof SVGLineElement && row.kind === 'message') {
      for (const [owner, attribute] of [
        [references[0], 'x1'],
        [references[1], 'x2'],
      ] as const) {
        if (owner !== actor) continue;
        const original = el[attribute].baseVal.value;
        updates.push((delta) => el.setAttribute(attribute, String(original + delta)));
      }
    } else {
      // Self-arrows and single-lane notes travel with their lane. A label
      // spanning two lanes stays centered between the moving endpoints.
      translate(el, new Set(references).size === 1 ? 1 : 0.5);
    }
  }
  // Mermaid positions activation bars and message numbers at a lane's x coordinate.
  const lines = [...svg.querySelectorAll<SVGLineElement>('line[data-et="life-line"]')];
  for (const el of svg.querySelectorAll<SVGGraphicsElement>(
    'rect[class^="activation"],[data-sequence-decoration]',
  )) {
    if (!actor) {
      if (
        el.hasAttribute('data-sequence-decoration') &&
        Number(el.getAttribute('data-statement')) === messageStart
      )
        translate(el);
      continue;
    }
    if (!lines.length) continue;
    const box = el.getBBox();
    const x = box.x + box.width / 2;
    const nearest = lines.reduce((a, b) =>
      Math.abs(x - a.x1.baseVal.value) <= Math.abs(x - b.x1.baseVal.value) ? a : b,
    );
    if (nearest.getAttribute('data-id') === actor) translate(el);
  }
  return (delta: number) => {
    for (const update of updates) update(delta);
  };
}
