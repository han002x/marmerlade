import { useEffect, useState } from 'react';
import { retitleField } from '../retitle';
import { useDiagram } from '../store';
import { useHotkeys } from '../useHotkeys';
import { AppearanceSettings } from '../components/AppearanceSettings';
import { backlinks, nodesOfPage, pathTo } from '../pages';
import { openNode, pageHref } from '../route';
import BrandMark from '../components/BrandMark';
import ProductNav from '../components/ProductNav';
import { Icon } from '../components/Icon';
import Document, { ModeSwitch, type PageMode } from './Document';
import Menu from './Menu';
import WikiLibrary from './WikiLibrary';
import NodeLinks from './NodeLinks';
import './wiki.css';

export default function WikiApp({ pageId, nodeId }: { pageId: string | null; nodeId?: string }) {
  const nodes = useDiagram((s) => s.nodes);
  const pages = useDiagram((s) => s.pages);
  const page = pages.find((p) => p.id === pageId);
  const pageNodes = page ? nodesOfPage(nodes, page.id) : [];
  const node = pageNodes.find((n) => n.id === nodeId) ?? pageNodes[0];
  const linked = page ? backlinks(page, nodes, pages) : [];
  const [mode, setMode] = useState<PageMode>('edit');
  const [sidebar, setSidebar] = useState<'pages' | 'appearance'>('pages');
  useHotkeys([{ key: 't', run: () => { setSidebar('appearance'); setIndex({ at: pageId }); } }]);
  // the narrow-screen index closes itself once a page is chosen
  const [index, setIndex] = useState<{ at: string | null } | null>(null);
  const indexOpen = index !== null && index.at === pageId;
  const where = (id: string) => pathTo(nodes, id).map((n) => n.label || 'Untitled').join(' › ');

  useEffect(() => {
    document.title = page ? `${page.title || 'Untitled'} · Wiki pages · marmerlade` : 'Wiki pages · marmerlade';
  }, [page]);


  const remove = () => {
    if (!page) return;
    if (page.body.trim() && !window.confirm(`Delete "${page.title || 'Untitled'}"?`)) return;
    window.location.hash = '#/wiki';
    useDiagram.getState().deletePage(page.id);
  };

  const create = (folderId?: string) => {
    setIndex(null);
    window.location.hash = pageHref(useDiagram.getState().createPage('', folderId));
  };

  const toPage = (id: string) => {
    const context = useDiagram.getState().nodes.find((n) => n.id === node?.id && n.pageIds?.includes(id));
    window.location.hash = pageHref(id, context?.id);
  };

  return (
    <div className={`wk${indexOpen ? ' nav-open' : ''}`} onKeyDown={event => {
      if (event.key === 'Escape' && indexOpen && !document.querySelector('dialog[open]')) {
        setIndex(null);
        event.currentTarget.querySelector<HTMLButtonElement>('.wk-nav-toggle')?.focus();
      }
    }}>
      <aside className="wk-index" id="wiki-sidebar">
        <div className="wk-index-head">
          <ProductNav current="wiki" onNavigate={() => setIndex(null)} />
        </div>
        <div className="wk-library-views" role="group" aria-label="Sidebar view">
          <button className="wk-btn" aria-label="Pages" title="Pages" aria-pressed={sidebar === 'pages'} onClick={() => setSidebar('pages')}><Icon name="page" size={16} /><span>Pages</span></button>
          <button className="wk-btn wk-library-appearance" aria-label="Appearance" title="Appearance" aria-pressed={sidebar === 'appearance'} onClick={() => setSidebar('appearance')}><Icon name="palette" size={16} /></button>
        </div>
        {sidebar === 'pages' ? <WikiLibrary pageId={pageId} onOpen={() => setIndex(null)} onCreate={create}
          href={id => pageHref(id, id === pageId ? nodeId : undefined)} /> :
          <div className="mf-appearance mf-appearance-docked" role="region" aria-label="Appearance"><AppearanceSettings /></div>}
      </aside>
      <button className="wk-scrim" aria-label="Close pages" onClick={() => setIndex(null)} />

      <main className="wk-main">
        <header className="wk-bar">
          <button className="wk-btn wk-nav-toggle" aria-expanded={indexOpen} aria-controls="wiki-sidebar"
            onClick={event => {
              setIndex(indexOpen ? null : { at: pageId });
              const app = event.currentTarget.closest('.wk');
              if (!indexOpen) requestAnimationFrame(() => app?.querySelector<HTMLElement>('.product-trigger')?.focus());
            }}>
            <BrandMark size={20} decorative /> Pages
          </button>
          <nav className="wk-crumbs" aria-label="Linked nodes">
            {page && <NodeLinks id={page.id} nodeId={nodeId} />}
          </nav>
          {page && <>
            <ModeSwitch value={page.body} mode={mode} onMode={setMode} />
            <Menu className="wk-icon" align="end" label="Page actions" button={<Icon name="more" size={16} />}>
              {node && <button role="menuitem" onClick={() => openNode(node.id)}>Show on canvas</button>}
              <button role="menuitem" className="danger" onClick={remove}>Delete page</button>
            </Menu>
          </>}
        </header>

        {page ? (
          <div className="wk-page-content">
            <input
              className="wk-title"
              aria-label="Page title"
              value={page.title}
              placeholder="Untitled"
              onChange={(e) => useDiagram.getState().updatePage(page.id, { title: e.target.value })}
              {...retitleField('page', page.id)}
            />
            <Document
              key={page.id}
              value={page.body}
              mode={mode}
              nodeId={node?.id}
              onPage={toPage}
              onChange={(body) => {
                const cur = useDiagram.getState().pages.find((p) => p.id === page.id);
                if (cur && cur.body !== body) useDiagram.getState().updatePage(page.id, { body });
              }}
            />
            {linked.length > 0 && (
              <footer className="wk-back">
                <h2>Linked from</h2>
                {linked.map((p) => (
                  <a key={p.id} href={pageHref(p.id)}>{p.title || 'Untitled'}</a>
                ))}
              </footer>
            )}
          </div>
        ) : (
          <div className="wk-page-content">
            <div className="wk-list">
              <div className="wk-list-head">
                <h1>Pages</h1>
                <button className="wk-btn" onClick={() => create()}>New page</button>
              </div>
              <ul>
                {[...pages].sort((a, b) => b.updatedAt - a.updatedAt).map((p) => {
                  const home = nodesOfPage(nodes, p.id)[0];
                  return <li key={p.id}>
                    <a href={pageHref(p.id, home?.id)}>
                      <span>{p.title || 'Untitled'}</span>
                      {home && <span>{where(home.id)}</span>}
                    </a>
                  </li>;
                })}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
