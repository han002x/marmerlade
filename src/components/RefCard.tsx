// A quick look at what a reference names: a page's text, a deck's first
// slide, a diagram's picture. Read-only; the link itself navigates.

import { useEffect, useMemo, useState } from 'react';
import { useDiagram, useEntities } from '../store';
import { activeAppearance, useAppearance } from '../theme';
import { diagramSvg } from '../mermaid/svg';
import { toMermaid } from '../mermaid/io';
import { entityDiagram, nodesOfPage, pathTo } from '../pages';
import { splitSlides } from '../slides';
import { parseRef } from '../references';
import Preview from '../wiki/Preview';
import Slide from '../slides/Slide';
import { Icon } from './Icon';
import '../wiki/wiki.css';
import '../slides/slides.css';

/** `page:<id>`, `deck:<id>`, `diagram:<id>`, `node:<id>` or `missing:<target>`. */
export type RefKey = string;

const split = (key: RefKey) => {
  const at = key.indexOf(':');
  return { kind: key.slice(0, at), id: key.slice(at + 1) };
};

function DiagramPicture({ source }: { source: string }) {
  const appearance = activeAppearance(useAppearance());
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (!source) return;
    const done = new AbortController();
    diagramSvg(source, appearance).then(
      (out) => { if (!done.signal.aborted) setSvg(out); },
      () => { if (!done.signal.aborted) setSvg(''); },
    );
    return () => done.abort();
  }, [source, appearance]);
  if (!source) return <p className="ref-empty">Empty diagram</p>;
  if (svg === null) return <div className="ref-picture" aria-busy="true" />;
  return svg ? <div className="ref-picture" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="ref-empty">Can't draw this diagram</p>;
}

export default function RefCard({ refKey }: { refKey: RefKey }) {
  const { kind, id } = split(refKey);
  const pages = useDiagram((s) => s.pages);
  const decks = useDiagram((s) => s.decks);
  const nodes = useDiagram((s) => s.nodes);
  const entities = useEntities();

  const page = kind === 'page' ? pages.find((p) => p.id === id) : undefined;
  const deck = kind === 'deck' ? decks.find((d) => d.id === id) : undefined;
  const entity = kind === 'diagram' ? entities.find((e) => e.id === id) : undefined;
  const node = kind === 'node' ? nodes.find((n) => n.id === id) : undefined;
  const slides = useMemo(() => (deck ? splitSlides(deck.body).slides : []), [deck]);
  const source = useMemo(
    () => (entity ? (entity.kind === 'flowchart' ? (entity.nodes.length ? toMermaid(entityDiagram(entity)) : '') : entity.source) : ''),
    [entity],
  );

  if (page) {
    const home = nodesOfPage(nodes, page.id)[0]?.id;
    return <>
      <header><Icon name="page" size={13} /><strong>{page.title || 'Untitled'}</strong></header>
      {page.body.trim()
        ? <div className="ref-page" inert><Preview body={page.body} nodeId={home} /></div>
        : <p className="ref-empty">Empty page</p>}
    </>;
  }
  if (deck) {
    const home = nodesOfPage(nodes, deck.id, 'deckIds')[0]?.id;
    return <>
      <header><Icon name="deck" size={13} /><strong>{deck.title || 'Untitled'}</strong>
        <small>{slides.length} {slides.length === 1 ? 'slide' : 'slides'}</small></header>
      <div className="ref-slide" inert>{slides[0] && <Slide slide={slides[0]} nodeId={home} />}</div>
    </>;
  }
  if (entity) {
    return <>
      <header><Icon name={entity.kind} size={13} /><strong>{entity.title}</strong></header>
      <DiagramPicture source={source} />
    </>;
  }
  if (node) {
    return <>
      <header><Icon name="page" size={13} /><strong>{node.label}</strong></header>
      <p className="ref-empty">{pathTo(nodes, node.id).map((n) => n.label || 'Untitled').join(' › ')} · no page yet</p>
    </>;
  }
  if (kind !== 'missing') return <p className="ref-empty">Not found</p>;
  const ref = parseRef(id);
  return <p className="ref-empty">No {ref.kind} named “{ref.name}”</p>;
}
