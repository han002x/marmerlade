import { ownerLinks, useDiagram } from '../store';
import { showPage } from '../dock';
import { Icon } from './Icon';

/** Open the default page of a node or sequence participant (`owner`, see linkOwners.ts) in the side panel. */
export function PageButton({ owner }: { owner: string }) {
  const has = useDiagram((s) => !!ownerLinks(s, owner, 'pageIds')?.length);
  // hovering previews the default page, once it exists
  const preview = useDiagram((s) => {
    const id = ownerLinks(s, owner, 'pageIds')?.[0];
    return id && s.pages.some((d) => d.id === id) ? `page:${id}` : undefined;
  });
  return (
    <button
      className={`mf-page nodrag nopan${has ? ' has-page' : ''}`}
      aria-label="Open page"
      title={preview ? undefined : 'Page  ·  W'}
      data-ref={preview}
      onClick={(e) => {
        e.stopPropagation();
        showPage(owner);
      }}
    >
      <Icon name="page" size={13} />
    </button>
  );
}
