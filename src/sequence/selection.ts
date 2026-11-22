import { blocks, type Statement } from './model';

/** Bind the rendered SVG to source ranges. Use diagram order to distinguish identical labels. */
export function bindSelection(svg: SVGSVGElement, rows: Statement[]) {
  const tag = (element: Element, row?: Statement) => {
    if (row) element.setAttribute('data-statement', String(row.start));
  };
  const inOrder = (selector: string, statements: Statement[]) => {
    svg.querySelectorAll(selector).forEach((element, i) => tag(element, statements[i]));
  };
  const messages = rows.filter((row) => row.kind === 'message');
  const title = svg.querySelector(':scope > text[y="-25"]');
  if (title) tag(title, rows.findLast((row) => row.kind === 'title' && row.values[0].trim() === title.textContent));
  // Mermaid emits each wrapped line as a separate text element just before the arrow.
  let index = 0;
  let labels: Element[] = [];
  for (const el of svg.querySelectorAll('.messageText,[data-et="message"]')) {
    if (el.classList.contains('messageText')) labels.push(el);
    else {
      const row = messages[index++];
      tag(el, row);
      for (const label of labels) tag(label, row);
      // Central-connection circles and sequence numbers are siblings of the arrow.
      let next = el.nextElementSibling;
      const decorations: Element[] = [];
      if (row?.values.slice(4).includes('()') && next?.matches('g')) {
        decorations.push(...next.querySelectorAll(':scope > circle'));
        next = next.nextElementSibling;
      }
      if (next?.matches('line[marker-start$="-sequencenumber)"]')) {
        decorations.push(next);
        if (next.nextElementSibling?.matches('.sequenceNumber')) decorations.push(next.nextElementSibling);
      }
      for (const decoration of decorations) {
        tag(decoration, row);
        decoration.setAttribute('data-sequence-decoration', '');
      }
      labels = [];
    }
  }
  inOrder(
    '[data-et="note"]',
    rows.filter((row) => row.kind === 'note'),
  );
  inOrder(
    '.activation0,.activation1,.activation2',
    rows.flatMap((row) => {
      if (row.kind === 'activate') return [row];
      if (row.kind !== 'message') return [];
      return [row.values[4], row.values[5]].filter((v) => v === '()' || v === '+').map(() => row);
    }),
  );
  // Mermaid lowers each new background behind the previous one.
  inOrder(
    ':scope > rect.rect',
    rows
      .filter((r) => r.kind === 'end' && r.parent?.kind === 'rect')
      .map((r) => r.parent!)
      .reverse(),
  );
  const boxes = rows.filter((r) => r.kind === 'box').reverse();
  svg.querySelectorAll(':scope > g > rect.rect').forEach((rect, i) => tag(rect.parentElement!, boxes[i]));
  const closed = rows
    .filter((row) => row.kind === 'end')
    .flatMap((row) => (row.parent && !['box', 'rect'].includes(row.parent.kind) ? [row.parent] : []));
  svg.querySelectorAll('[data-et="control-structure"]').forEach((group, i) => {
    const row = closed[i];
    tag(group, row);
    const branches = rows.filter(
      (child) => child.parent === row && ['else', 'and', 'option'].includes(child.kind) && child.values[0],
    );
    group.querySelectorAll('.sectionTitle').forEach((title, j) => tag(title, branches[j]));
  });
  const lifelines = [...svg.querySelectorAll<SVGLineElement>('line[data-et="life-line"]')];
  for (const el of svg.querySelectorAll<SVGGraphicsElement>(
    '[data-et="participant"],[data-et="life-line"],.actor-bottom',
  )) {
    let part: SVGGraphicsElement = el;
    let id = el.getAttribute('data-id') ?? el.getAttribute('name');
    if (el.classList.contains('actor-bottom')) {
      // Queue and database footers have no actor ID. Their top-level group contains the icon and label.
      while (part.parentNode instanceof SVGGElement) part = part.parentNode;
      if (!id && lifelines.length) {
        const box = part.getBBox();
        const center = box.x + box.width / 2;
        const nearest = lifelines.reduce((a, b) =>
          Math.abs(center - a.x1.baseVal.value) <= Math.abs(center - b.x1.baseVal.value) ? a : b,
        );
        id = nearest.getAttribute('data-id');
      }
    }
    if (!id) continue;
    part.setAttribute('data-sequence-actor', id);
    const actor = rows.find((row) => row.kind === 'participant' && row.values[0] === id);
    tag(part, actor ?? messages.find((row) => row.values.slice(0, 2).includes(id)));
  }
}

export function summary(row: Statement) {
  if (row.kind === 'message')
    return row.values[0] + ' → ' + row.values[1] + (row.values[3] ? ' · ' + row.values[3] : '');
  if (row.kind === 'participant')
    return (row.values[2] === 'actor' ? 'Actor · ' : 'Participant · ') + (row.values[1] || row.values[0]);
  if (blocks.includes(row.kind)) return row.kind + (row.values[0] ? ' · ' + row.values[0] : '');
  return row.text;
}
