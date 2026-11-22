import { ownerLinks, useDiagram } from '../store';
import { showDeck } from '../dock';
import { Icon } from './Icon';

/** Open the default slide deck of a node or sequence participant (`owner`, see linkOwners.ts) in the side panel. */
export function DeckButton({ owner }: { owner: string }) {
  const has = useDiagram((s) => !!ownerLinks(s, owner, 'deckIds')?.length);
  // hovering previews the default deck, once it exists
  const preview = useDiagram((s) => {
    const id = ownerLinks(s, owner, 'deckIds')?.[0];
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
        showDeck(owner);
      }}
    >
      <Icon name="deck" size={13} />
    </button>
  );
}
