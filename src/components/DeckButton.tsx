import { useDiagram } from '../store';
import { showDeck } from '../dock';
import { Icon } from './Icon';

/** Open the node's default slide deck in the side panel. */
export function DeckButton({ nodeId }: { nodeId: string }) {
  const has = useDiagram((s) => !!s.nodes.find((n) => n.id === nodeId)?.deckIds?.length);
  // hovering previews the default deck, once it exists
  const preview = useDiagram((s) => {
    const id = s.nodes.find((n) => n.id === nodeId)?.deckIds?.[0];
    return id && s.decks.some((d) => d.id === id) ? `deck:${id}` : undefined;
  });
  return (
    <button
      className={`mf-page mf-deck nodrag nopan${has ? ' has-page' : ''}`}
      aria-label="Open slides"
      title={preview ? undefined : 'Slides  ·  K'}
      data-ref={preview}
      onClick={(e) => {
        e.stopPropagation();
        showDeck(nodeId);
      }}
    >
      <Icon name="deck" size={13} />
    </button>
  );
}
