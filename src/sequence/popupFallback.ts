import type { Mermaid } from 'mermaid';
import { statements } from './model';

// Mermaid 11.17.2's actor popup renderer assumes a rectangular actor. For
// stereotype symbols it can throw after drawing the diagram. Keep the symbols
// and render their links as a legend when this specific upstream error occurs.
export async function drawWithLinkLegend(mermaid: Mermaid, source: string, id: string, host: HTMLElement) {
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
  const db = diagram.db as { getActors(): Map<string, { links?: Record<string, string> }> };
  const links = [...db.getActors()].flatMap(([actor, data]) =>
    Object.entries(data.links ?? {}).map(([label, url]) => ({ label: actor + ' · ' + label, url })),
  );
  let drawing = source;
  for (const row of statements(source).toReversed()) {
    if (['link', 'links', 'details'].includes(row.kind))
      drawing = drawing.slice(0, row.start) + drawing.slice(row.end);
  }
  const { svg } = await mermaid.render(id, drawing, host);
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement as unknown as SVGSVGElement;
  const box = root.viewBox.baseVal;
  const x = box.x + 10,
    y = box.y + box.height;
  const ns = root.namespaceURI;
  let width = box.width;
  links.forEach(({ label, url }, i) => {
    const anchor = doc.createElementNS(ns, 'a');
    if (typeof url === 'string' && /^(https?:\/\/|mailto:|#)/i.test(url)) anchor.setAttribute('href', url);
    const text = doc.createElementNS(ns, 'text');
    text.textContent = label;
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y + (i + 1) * 22));
    text.setAttribute('fill', 'currentColor');
    text.setAttribute('font-size', '14');
    anchor.appendChild(text);
    root.appendChild(anchor);
    width = Math.max(width, label.length * 9 + 20);
  });
  root.setAttribute('viewBox', [box.x, box.y, width, box.height + links.length * 22 + 6].join(' '));
  return new XMLSerializer().serializeToString(root);
}
