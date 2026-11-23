import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import type { LinkOwner } from '../linkOwners';
import { pathTo, type LinkKey } from '../pages';
import { deckHref, pageHref } from '../route';
import type { DiagramNode, Page } from '../types';
import { byLibraryTitle, libraryTitle } from './libraryTitles';

export default function Navigation({ nodes, pages, pageId, nodeId, onPage, linkTo, empty = 'No pages yet', kind = 'pageIds' }: {
  nodes: DiagramNode[];
  pages: Page[];
  pageId: string | null;
  nodeId: string | undefined;
  /** open a page here instead of following its wiki link */
  onPage?: (pageId: string, nodeId?: string) => void;
  linkTo?: LinkOwner;
  empty?: string;
  /** which of a node's links to list: its pages, or its slide decks */
  kind?: LinkKey;
}) {
  const decks = kind === 'deckIds';
  const href = decks ? deckHref : pageHref;
  const [branches, setBranches] = useState(() => ({ nodes, pageId, nodeId, closed: new Set<string>() }));
  if (branches.nodes !== nodes || branches.pageId !== pageId || branches.nodeId !== nodeId) {
    const closed = new Set(branches.closed);
    if (nodeId) for (const node of pathTo(nodes, nodeId)) closed.delete(node.id);
    setBranches({ nodes, pageId, nodeId, closed });
  }
  const { children, documents, unplaced } = useMemo(() => {
    const pagesById = new Map(pages.map((page) => [page.id, page]));
    const visible = new Set<string>();
    const placed = new Set<string>();
    const documents = new Map<string, Page[]>();
    for (const node of nodes) {
      // The slides index gives a deck the path of its first linked node.
      const own = (node[kind] ?? []).flatMap((id) => {
        const page = pagesById.get(id);
        if (!page || (decks && placed.has(id))) return [];
        placed.add(id);
        return [page];
      });
      if (!own.length) continue;
      documents.set(node.id, decks ? own.sort(byLibraryTitle) : own);
      for (const ancestor of pathTo(nodes, node.id)) visible.add(ancestor.id);
    }
    const children = new Map<string | null, DiagramNode[]>();
    for (const node of nodes) {
      if (!visible.has(node.id)) continue;
      const parent = node.parentId && visible.has(node.parentId) ? node.parentId : null;
      const siblings = children.get(parent) ?? [];
      siblings.push(node);
      children.set(parent, siblings);
    }
    return {
      children,
      documents,
      unplaced: pages.filter((page) => !placed.has(page.id)).sort(byLibraryTitle),
    };
  }, [nodes, pages, kind, decks]);

  const toggle = (id: string) => setBranches((previous) => {
    const closed = new Set(previous.closed);
    if (closed.has(id)) closed.delete(id);
    else closed.add(id);
    return { ...previous, closed };
  });

  const pageLink = (page: Page, context?: string) => {
    const title = libraryTitle(page);
    const current = page.id === pageId && (decks || context === nodeId);
    const linked = linkTo?.[kind]?.includes(page.id) ?? false;
    const contents = <>
      <Icon name={decks ? 'deck' : 'page'} size={14} />
      <span className="wk-library-name">{title}</span>
    </>;
    if (linkTo && onPage) return (
      <button type="button" className={`wk-item${current ? ' on' : ''}${linked ? ' linked' : ''}`}
        aria-current={current ? 'page' : undefined}
        aria-description={linked ? 'Linked to the selection' : 'Link to the selection'}
        title={linked ? title : `Link ${title} to ${linkTo.label || 'the selection'}`}
        onClick={() => onPage(page.id, context)}>
        {contents}
        <Icon name={linked ? 'check' : 'link'} size={13} />
      </button>
    );
    return (
      <a href={href(page.id, context)} className={`wk-item${current ? ' on' : ''}`}
        aria-current={current ? 'page' : undefined} title={title}
        onClick={onPage && ((event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onPage(page.id, context);
        })}>
        {contents}
      </a>
    );
  };

  const renderNodes = (parentId: string | null) => (
    <ul className="wk-tree-list">
      {(children.get(parentId) ?? []).map((node) => {
        const expanded = !branches.closed.has(node.id);
        const name = node.label || node.id;
        const own = documents.get(node.id) ?? [];
        // a node whose only page carries its name is one row, not two
        const solo = own.length === 1 && own[0].title === node.label ? own[0] : null;
        const nested = children.has(node.id);
        const chevron = <span className={`wk-tree-chevron${expanded ? ' expanded' : ''}`} aria-hidden="true">›</span>;
        const state = { 'aria-expanded': expanded, 'aria-label': `${expanded ? 'Collapse' : 'Expand'} ${name}` };
        return (
          <li key={node.id}>
            {solo ? <div className="wk-tree-solo">
              {nested ? <button className="wk-tree-toggle" {...state} onClick={() => toggle(node.id)}>{chevron}</button>
                : <span className="wk-tree-toggle" />}
              {pageLink(solo, node.id)}
            </div> : <button className="wk-tree-node" {...state} title={name} onClick={() => toggle(node.id)}>
              {chevron}
              <Icon name={decks ? 'folder' : nested ? 'group' : 'rect'} size={14} />
              <span className="wk-tree-label">{name}</span>
            </button>}
            {expanded && (nested || !solo) && <div className="wk-tree-children">
              {!solo && <ul className="wk-tree-list">
                {own.map((page) => <li key={page.id}>{pageLink(page, node.id)}</li>)}
              </ul>}
              {renderNodes(node.id)}
            </div>}
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav className="wk-navigation" aria-label={decks ? 'Slide decks' : 'Wiki pages'}>
      {pages.length === 0 && <p className="wk-index-empty" role="status">{empty}</p>}
      {renderNodes(null)}
      {unplaced.length > 0 && <section className={decks && !children.size ? undefined : 'wk-unlinked'} aria-label={decks ? 'Other decks' : 'Unlinked pages'}>
        {(!decks || children.size > 0) && <h2 className="wk-index-heading">{decks ? 'Other decks' : 'Unlinked'}</h2>}
        <ul className="wk-tree-list">
          {unplaced.map((page) => <li key={page.id}>{pageLink(page)}</li>)}
        </ul>
      </section>}
    </nav>
  );
}
