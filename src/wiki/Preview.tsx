import { useEffect, useMemo, useRef } from 'react';
import { useDiagram, useEntities } from '../store';
import { activeAppearance, useAppearance } from '../theme';
import { diagramSvg } from '../mermaid/svg';
import { toMermaid } from '../mermaid/io';
import { embedDiagram, entityDiagram, resolveEmbed } from '../pages';
import { openBoard, openNode, openSlides, pageHref, parseRoute } from '../route';
import { renderPage } from './render';
import { decodeDiagramTarget } from '../diagramEmbed';

/** Rendered page. Wikilinks navigate; embedded diagram nodes jump to the canvas. */
export default function Preview({
  body,
  nodeId,
  onPage = (id) => (window.location.hash = pageHref(id)),
  onNode = openNode,
  onDeck = (id) => openSlides(id),
  onDiagram = openBoard,
  onDiagramWidth,
}: {
  body: string;
  nodeId?: string;
  /** a wikilink to a page was followed */
  onPage?: (pageId: string) => void;
  /** a node in the embedded diagram was clicked */
  onNode?: (nodeId: string) => void;
  /** a `[[deck:…]]` link was followed */
  onDeck?: (deckId: string) => void;
  /** a `[[diagram:…]]` link, or a whole embedded diagram, was followed */
  onDiagram?: (diagramId: string) => void;
  onDiagramWidth?: (width: number) => void;
}) {
  const nodes = useDiagram((s) => s.nodes);
  const sequence = useDiagram(s => s.sequence);
  const edges = useDiagram((s) => s.edges);
  const pages = useDiagram((s) => s.pages);
  const decks = useDiagram((s) => s.decks);
  const diagrams = useEntities();
  const appearance = activeAppearance(useAppearance());
  const root = useRef<HTMLDivElement>(null);

  const html = useMemo(() => renderPage(body, { nodes, pages, decks, diagrams }), [body, nodes, pages, decks, diagrams]);

  useEffect(() => {
    const hosts = root.current?.querySelectorAll<HTMLElement>('[data-embed], [data-mermaid], [data-sequence]');
    if (!hosts?.length) return;
    const render = new AbortController();
    hosts.forEach((host) => {
      // a fence carries its own source; an embed draws a node of the live diagram
      const fence = host.dataset.mermaid === undefined ? undefined : decodeURIComponent(host.dataset.mermaid);
      let source = fence ?? '';
      delete host.dataset.entity;
      if (host.dataset.sequence !== undefined) {
        const pick = host.dataset.sequence ? resolveEmbed(host.dataset.sequence, nodes, diagrams, undefined, true) : undefined;
        if (pick?.kind === 'entity' && pick.entity.kind === 'sequence') host.dataset.entity = pick.entity.id;
        source = host.dataset.sequence ? (pick?.kind === 'entity' && pick.entity.kind === 'sequence' ? pick.entity.source : '') : sequence ?? '';
      }
      if (host.dataset.embed !== undefined) {
        const target = host.dataset.slideDiagram === undefined ? host.dataset.embed : decodeDiagramTarget(host.dataset.slideDiagram);
        const pick = resolveEmbed(target, nodes, diagrams, nodeId);
        if (pick?.kind === 'entity') host.dataset.entity = pick.entity.id;
        const sub = pick?.kind === 'node' ? embedDiagram({ nodes, edges }, pick.id)
          : pick?.kind === 'entity' && pick.entity.kind === 'flowchart' ? entityDiagram(pick.entity) : null;
        source = pick?.kind === 'entity' && pick.entity.kind === 'sequence' ? pick.entity.source
          : sub?.nodes.length ? toMermaid(sub) : '';
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
  }, [html, sequence, nodes, edges, diagrams, nodeId, appearance, onDiagramWidth]);

  const onClick = (e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !(e.target instanceof Element)) return;
    const t = e.target;
    const link = t.closest<HTMLAnchorElement>('a.wl');
    const [kind, refId] = (link?.dataset.ref ?? '').split(/:(.*)/s);
    if (link && (kind === 'deck' || kind === 'diagram')) {
      e.preventDefault();
      if (kind === 'deck') onDeck(refId);
      else onDiagram(refId);
      return;
    }
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
    // a whole diagram opens as itself: node ids are only unique within one flowchart
    const entity = t.closest<HTMLElement>('[data-entity]')?.dataset.entity;
    if (entity) {
      if (t.closest('svg')) onDiagram(entity);
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
