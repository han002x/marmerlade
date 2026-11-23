import { useMemo, useState } from 'react';
import { retitleField } from '../retitle';
import { useDiagram, useLinkOwner, useStructure } from '../store';
import { parseParticipantOwner } from '../linkOwners';
import { useDock } from '../dock';
import { nodesOfPage, pageOf, pathTo } from '../pages';
import { splitSlides } from '../slides';
import { deckHref, nodeHref, openSlides } from '../route';
import { saveForNavigation } from '../persist';
import LibrarySearch from '../wiki/LibrarySearch';
import { byLibraryTitle, libraryTitle, matchesTitle } from '../wiki/libraryTitles';
import Menu from '../wiki/Menu';
import Navigation from '../wiki/Navigation';
import SourceEditor from '../wiki/SourceEditor';
import Slide from '../slides/Slide';
import { Icon } from './Icon';
import '../wiki/wiki.css';
import '../slides/slides.css';

const useSlides = (body: string) => useMemo(() => splitSlides(body).slides, [body]);

/** The selected node's slide deck beside the canvas: its slides, or its Markdown. */
export default function SlidesPanel({ canLink }: { canLink: boolean }) {
  const nodes = useStructure();
  const decks = useDiagram((s) => s.decks);
  const selectedNode = useDiagram((s) => s.selectedNodeIds[0]);
  const participant = useDock((s) => s.participant);
  // a node, or a sequence participant (linkOwners.ts)
  const selected = canLink ? participant ?? selectedNode : undefined;
  const mode = useDock((s) => s.deckMode);
  const setMode = useDock((s) => s.setDeckMode);
  const active = useDock((s) => s.deck);
  const setDeck = useDock((s) => s.setDeck);
  const [query, setQuery] = useState('');
  const filteredDecks = useMemo(() => decks.filter((d) => matchesTitle(libraryTitle(d), query)), [decks, query]);

  const node = useLinkOwner(selected);
  const chosen = active && active.selection === selected && (!node || node.deckIds?.includes(active.id))
    ? decks.find((d) => d.id === active.id) : undefined;
  const deck = chosen ?? pageOf(node, decks, 'deckIds');
  const deckHome = deck && nodes.find((n) => n.deckIds?.includes(deck.id));
  const deckOwner = deck && node?.deckIds?.includes(deck.id) ? node : deckHome;
  // crumbs, slide embeds and the slides window's `?node=` only know flowchart nodes
  const deckNode = deckOwner && !parseParticipantOwner(deckOwner.id) ? deckOwner : undefined;
  const slides = useSlides(deck?.body ?? '');

  /** Show a deck on one of its nodes, or on its own when it has none. */
  const open = (id: string, nodeId?: string) => {
    if (node || !canLink) {
      if (node && !node.deckIds?.includes(id)) useDiagram.getState().linkDeck(id, node.id);
      setDeck(id);
      return;
    }
    const st = useDiagram.getState();
    const targets = nodesOfPage(st.nodes, id, 'deckIds');
    const target = targets.find((n) => n.id === (nodeId ?? selected)) ?? targets[0];
    if (target) {
      useDock.getState().setParticipant(null);
      st.setSelection([target.id], []);
      useDock.setState({ deck: { selection: target.id, id } });
      if (target.id !== selected) window.location.hash = nodeHref(target.id);
    } else {
      st.setSelection([], []);
      useDock.getState().setParticipant(null);
      setDeck(id);
    }
  };

  const ids = node?.deckIds ?? [];
  const available = decks.filter((d) => !ids.includes(d.id)).sort(byLibraryTitle);
  const create = () => {
    if (!node) return;
    const st = useDiagram.getState();
    setDeck(deck ? st.createDeckForNode(node.id) : st.openDeck(node.id));
  };
  const crumbs = deckNode ? pathTo(nodes, deckNode.id).slice(0, -1) : [];
  return (
    <div className="wk-page-panel sl-dock-layout">
      <aside className="wk-dock-library" aria-label="Deck library">
        <LibrarySearch label="Search decks" value={query} onChange={setQuery} />
        <Navigation key={query.trim()} kind="deckIds" nodes={nodes} pages={filteredDecks}
          pageId={deck?.id ?? null} nodeId={deckHome?.id} onPage={open} linkTo={node}
          empty={query.trim() ? 'No matching decks' : 'No decks yet'} />
      </aside>
      {deck ? <div className="wk-dock">
        <div className="wk-dock-bar">
          <div className="wk-crumbs">
            {node && crumbs.map((n) => (
              <button key={n.id} className="wk-crumb" onClick={() => { window.location.hash = nodeHref(n.id); }}>
                {n.label || 'Group'}
              </button>
            ))}
          </div>
          <div className="wk-seg" role="tablist" aria-label="Deck mode">
            {(['slides', 'source'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
                {m === 'slides' ? 'Slides' : 'Markdown'}
              </button>
            ))}
          </div>
        </div>
        <div className="wk-dock-head">
          <input
            className="wk-title"
            aria-label="Deck title"
            value={deck.title}
            placeholder="Untitled"
            onChange={(e) => useDiagram.getState().updateDeck(deck.id, { title: e.target.value })}
            {...retitleField('deck', deck.id)}
          />
          {node && (
            <Menu className="wk-icon" align="end" label="Decks on this node" button={<Icon name="lucide-link" />}>
              {ids.map((id, i) => (
                <button key={id} role="menuitemradio" aria-checked={id === deck.id} onClick={() => setDeck(id)}>
                  <span>{decks.find((d) => d.id === id)?.title || 'Untitled'}</span>
                  {i === 0 && ids.length > 1 && <small>default</small>}
                </button>
              ))}
              <hr />
              <button role="menuitem" onClick={create}>New deck</button>
              {deck.id !== ids[0] && (
                <button role="menuitem" onClick={() => useDiagram.getState().makeDefaultDeck(deck.id, node.id)}>
                  Make default
                </button>
              )}
              <button role="menuitem" onClick={() => {
                useDiagram.getState().unlinkDeck(deck.id, node.id);
                setDeck(null);
              }}>
                <span>Unlink from {node.label || 'this node'}</span>
              </button>
              {available.length > 0 && <>
                <hr />
                <div className="wk-menu-label">Link existing deck</div>
              </>}
              {available.map((d) => (
                <button key={d.id} role="menuitem" onClick={() => open(d.id)}>
                  <span>{d.title || 'Untitled'}</span>
                </button>
              ))}
            </Menu>
          )}
          <button className="wk-btn" onClick={() => {
            saveForNavigation();
            window.location.hash = deckHref(deck.id, deckNode?.id, 1);
          }}>Present</button>
          <button className="wk-icon" onClick={() => {
            saveForNavigation();
            openSlides(deck.id, deckNode?.id);
          }} title="Open in slides" aria-label="Open in slides">
            ↗
          </button>
        </div>
        {mode === 'source' ? (
          <SourceEditor
            key={deck.id}
            value={deck.body}
            onChange={(body) => {
              const cur = useDiagram.getState().decks.find((d) => d.id === deck.id);
              if (cur && cur.body !== body) useDiagram.getState().updateDeck(deck.id, { body });
            }}
          />
        ) : (
          <ol className="sl-strip sl-dock-strip" aria-label="Slides">
            {slides.map((s, i) => (
              <li key={i}>
                <div className="sl-tools">
                  {/* a slide's number presents from that slide, in the slides window */}
                  <a className="sl-number" href={deckHref(deck.id, deckNode?.id, i + 1)} target="marmerlade-slides"
                    onClick={saveForNavigation}
                    title="Present from here" aria-label={`Present from slide ${i + 1}`}>
                    {i + 1}
                  </a>
                </div>
                <Slide slide={s} nodeId={deckNode?.id} />
              </li>
            ))}
          </ol>
        )}
      </div> : <div className="wk-dock wk-dock-empty">
        {node ? <>
          <button className="wk-btn" onClick={create}>New deck</button>
          {decks.length > 0 && <p className="wk-index-empty">Choose a deck to link it to {node.label || 'the selection'}.</p>}
        </> : <p className="wk-index-empty">{decks.length ? 'Choose a deck to view its slides.' : 'Select a node or participant to create a deck.'}</p>}
      </div>}
    </div>
  );
}
