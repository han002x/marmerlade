import { useEffect, useMemo, useRef } from 'react';
import { useDiagram } from '../store';
import { activeAppearance, useAppearance } from '../theme';
import { diagramSvg } from '../mermaid/svg';
import { toMermaid } from '../mermaid/io';
import { embedDiagram, embedNode } from '../pages';
import { openNode, pageHref, parseRoute } from '../route';
import { renderPage } from './render';
import { decodeDiagramTarget } from '../diagramEmbed';

/** Rendered page. Wikilinks navigate; embedded diagram nodes jump to the canvas. */
export default function Preview({
  body,
  nodeId,
  onPage = (id) => (window.location.hash = pageHref(id)),
  onNode = openNode,
  onDiagramWidth,
}: {
  body: string;
  nodeId?: string;
  /** a wikilink to a page was followed */
  onPage?: (pageId: string) => void;
  /** a node in the embedded diagram was clicked */
  onNode?: (nodeId: string) => void;
  onDiagramWidth?: (width: number) => void;
}) {
  const nodes = useDiagram((s) => s.nodes);
  const sequence = useDiagram(s => s.sequence);
  const edges = useDiagram((s) => s.edges);
  const pages = useDiagram((s) => s.pages);
  const appearance = activeAppearance(useAppearance());
  const root = useRef<HTMLDivElement>(null);

  const html = useMemo(() => renderPage(body, { nodes, pages }), [body, nodes, pages]);

  useEffect(() => {
    const hosts = root.current?.querySelectorAll<HTMLElement>('[data-embed], [data-mermaid], [data-sequence]');
    if (!hosts?.length) return;
    const render = new AbortController();
    hosts.forEach((host) => {
      // a fence carries its own source; an embed draws a node of the live diagram
      const fence = host.dataset.mermaid === undefined ? undefined : decodeURIComponent(host.dataset.mermaid);
      let source = host.hasAttribute('data-sequence') ? sequence ?? '' : fence ?? '';
      if (host.dataset.embed !== undefined) {
        const target = host.dataset.slideDiagram === undefined ? host.dataset.embed : decodeDiagramTarget(host.dataset.slideDiagram);
        const id = embedNode(target, nodes, nodeId);
        const sub = id ? embedDiagram({ nodes, edges }, id) : null;
        source = sub?.nodes.length ? toMermaid(sub) : '';
      }
      const key = `${JSON.stringify(appearance)}\u0000${source}`;
      if (host.dataset.shown === key) return;
      const show = (svg?: string) => {
        if (render.signal.aborted) return;
        host.dataset.shown = key;
        if (svg) {
          host.innerHTML = svg;
          // drawn width, so a slide can scale the picture with its own size
          const drawn = host.querySelector('svg')?.viewBox.baseVal.width;
          if (drawn) {
            host.style.setProperty('--embed-w', String(drawn));
            onDiagramWidth?.(drawn);
          }
        }
        else if (host.hasAttribute('data-sequence')) host.textContent = 'Sequence diagram unavailable';
        else host.textContent = fence ?? (host.dataset.slideDiagram === undefined ? '' : 'Diagram unavailable');
      };
      if (source) void diagramSvg(source, appearance).then(show, () => show());
      else show();
    });
    return () => render.abort();
  }, [html, sequence, nodes, edges, nodeId, appearance, onDiagramWidth]);

  const onClick = (e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !(e.target instanceof Element)) return;
    const t = e.target;
    const link = t.closest<HTMLAnchorElement>('a.wl');
    if (link) {
      e.preventDefault();
      const st = useDiagram.getState();
      const route = parseRoute(link.getAttribute('href') ?? '');
      const id = link.dataset.node ? st.openPage(link.dataset.node)
        : link.dataset.create ? st.createPage(link.dataset.create)
        : route.kind === 'wiki' ? route.id : null;
      if (id) onPage(id);
      return;
    }
    const hit = /^flowchart-(.+)-\d+$/.exec(t.closest('[data-embed] .node')?.id ?? '');
    if (hit) onNode(hit[1]);
  };

  return (
    <div
      className="wk-preview wk-prose"
      ref={root}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
