import { useDiagram } from '../store';
import { showPage } from '../dock';
import { Icon } from './Icon';

/** Open the node's default page in the side panel. */
export function PageButton({ nodeId }: { nodeId: string }) {
  const has = useDiagram((s) => !!s.nodes.find((n) => n.id === nodeId)?.pageIds?.length);
  // hovering previews the default page, once it exists
  const preview = useDiagram((s) => {
    const id = s.nodes.find((n) => n.id === nodeId)?.pageIds?.[0];
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
        showPage(nodeId);
      }}
    >
      <Icon name="page" size={13} />
    </button>
  );
}
