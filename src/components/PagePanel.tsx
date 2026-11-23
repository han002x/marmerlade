import { useDiagram, useLinkOwner } from '../store';
import { parseParticipantOwner } from '../linkOwners';
import { retitleField } from '../retitle';
import { showPage, useDock } from '../dock';
import { nodesOfPage, pageOf, pathTo } from '../pages';
import { nodeHref, openWiki } from '../route';
import Document, { ModeSwitch } from '../wiki/Document';
import Menu from '../wiki/Menu';
import WikiLibrary from '../wiki/WikiLibrary';
import '../wiki/wiki.css';

/** The selected node's wiki page, editable beside the canvas. */
export default function PagePanel({ canLink }: { canLink: boolean }) {
  const nodes = useDiagram((s) => s.nodes);
  const pages = useDiagram((s) => s.pages);
  const selectedNode = useDiagram((s) => s.selectedNodeIds[0]);
  const participant = useDock((s) => s.participant);
  // a node, or a sequence participant (linkOwners.ts)
  const selected = participant ?? selectedNode;
  const mode = useDock((s) => s.mode);
  const setMode = useDock((s) => s.setMode);
  const active = useDock((s) => s.page);
  const setPage = useDock((s) => s.setPage);

  const node = useLinkOwner(canLink ? selected : undefined);
  const chosen = active && active.selection === selected && (!node || node.pageIds?.includes(active.id))
    ? pages.find((p) => p.id === active.id) : undefined;
  const page = chosen ?? pageOf(node, pages);
  const pageOwner = page ? (node?.pageIds?.includes(page.id) ? node : nodesOfPage(nodes, page.id)[0]) : undefined;
  // embeds, crumbs and the wiki's `?node=` only know flowchart nodes
  const pageNode = pageOwner && !parseParticipantOwner(pageOwner.id) ? pageOwner : undefined;

  /** Show a page on one of its nodes, or on its own when it has none. */
  const open = (id: string) => {
    const st = useDiagram.getState();
    if (node?.pageIds?.includes(id)) {
      setPage(id);
      return;
    }
    const targets = nodesOfPage(st.nodes, id);
    const target = targets[0];
    if (target) {
      showPage(target.id, id);
      if (target.id !== selected) window.location.hash = nodeHref(target.id);
    } else {
      st.setSelection([], []);
      useDock.getState().setParticipant(null);
      setPage(id);
    }
  };
  const toNode = (id: string) => {
    window.location.hash = nodeHref(id);
  };

  const ids = node?.pageIds ?? [];
  const available = pages.filter((p) => !ids.includes(p.id)).sort((a, b) => a.title.localeCompare(b.title));
  const create = () => {
    if (!node) return;
    const st = useDiagram.getState();
    setPage(page ? st.createPageForNode(node.id) : st.openPage(node.id));
    setMode('edit');
  };
  const selectPage = (id: string) => {
    if (node && !ids.includes(id)) useDiagram.getState().linkPage(id, node.id);
    setPage(id);
  };

  const crumbs = pageNode ? pathTo(nodes, pageNode.id).slice(0, -1) : [];
  return (
    <div className="wk-page-panel">
      <aside className="wk-dock-library" aria-label="Wiki library" onKeyDown={(event) => {
        if (event.key === ' ' && event.target instanceof HTMLButtonElement) event.stopPropagation();
      }}>
        <WikiLibrary kind="diagram" pageId={page?.id ?? null} linkedPageIds={node ? ids : null} onOpen={selectPage} />
      </aside>
      {page ? <div className="wk-dock">
        <div className="wk-dock-bar">
          <div className="wk-crumbs">
            {node && crumbs.map((n) => (
              <button key={n.id} className="wk-crumb" onClick={() => toNode(n.id)}>
                {n.label || 'Group'}
              </button>
            ))}
          </div>
          <ModeSwitch value={page.body} mode={mode} onMode={setMode} />
        </div>
        <div className="wk-dock-head">
          <input
            className="wk-title"
            aria-label="Page title"
            value={page.title}
            placeholder="Untitled"
            onChange={(e) => useDiagram.getState().updatePage(page.id, { title: e.target.value })}
            {...retitleField('page', page.id)}
          />
          {node && (
            <Menu className="wk-icon" align="end" label="Pages on this node" button="⌄">
              {ids.map((id, i) => (
                <button key={id} role="menuitemradio" aria-checked={id === page.id}
                  onClick={() => setPage(useDiagram.getState().openPage(node.id, id))}>
                  <span>{pages.find((p) => p.id === id)?.title || 'Untitled'}</span>
                  {i === 0 && ids.length > 1 && <small>default</small>}
                </button>
              ))}
              <hr />
              <button role="menuitem" onClick={create}>New page</button>
              {page.id !== ids[0] && (
                <button role="menuitem" onClick={() => useDiagram.getState().makeDefaultPage(page.id, node.id)}>
                  Make default
                </button>
              )}
              <button role="menuitem" onClick={() => {
                useDiagram.getState().unlinkPage(page.id, node.id);
                setPage(null);
              }}>
                <span>Unlink from {node.label || 'this node'}</span>
              </button>
              {available.length > 0 && <>
                <hr />
                <div className="wk-menu-label">Link existing page</div>
              </>}
              {available.map((p) => (
                <button key={p.id} role="menuitem" onClick={() => selectPage(p.id)}>
                  <span>{p.title || 'Untitled'}</span>
                </button>
              ))}
            </Menu>
          )}
          <button className="wk-icon" onClick={() => openWiki(page.id, pageNode?.id)} title="Open in wiki" aria-label="Open in wiki">
            ↗
          </button>
        </div>
        <Document
          key={page.id}
          value={page.body}
          mode={mode}
          nodeId={pageNode?.id}
          onPage={open}
          onNode={toNode}
          onChange={(body) => {
            const cur = useDiagram.getState().pages.find((p) => p.id === page.id);
            if (cur && cur.body !== body) useDiagram.getState().updatePage(page.id, { body });
          }}
        />
      </div> : <div className="wk-dock wk-dock-empty">
        {node ? <button className="wk-btn" onClick={create}>New page</button> :
          <p className="wk-index-empty">{pages.length ? 'Choose a page to open it.' : 'Select a node or participant to write its page.'}</p>}
      </div>}
    </div>
  );
}
