import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Icon } from '../components/Icon';
import { useDiagram } from '../store';
import type { Page, WikiFolder } from '../types';
import { folderTrail } from '../wikiFolders';
import LibrarySearch from './LibrarySearch';
import { byLibraryTitle, libraryTitle, matchesTitle } from './libraryTitles';
import Menu from './Menu';

const wikiPageDragType = 'application/x-marmerlade-wiki-page';

type FolderAction =
  | { kind: 'create'; parentId: string | null }
  | { kind: 'rename' | 'move'; folder: WikiFolder }
  | { kind: 'page'; page: Page }
  | { kind: 'delete'; folder: WikiFolder };

function FolderDialog({ action, folders, onDone }: {
  action: FolderAction;
  folders: ReadonlyMap<string, WikiFolder>;
  onDone: (reveal?: string | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(action.kind === 'rename' ? action.folder.name : '');
  const [destination, setDestination] = useState(
    action.kind === 'move' ? action.folder.parentId :
      action.kind === 'page' ? [...folders.values()].find(folder => folder.pageIds.includes(action.page.id))?.id ?? null : null,
  );
  const naming = action.kind === 'create' || action.kind === 'rename';
  const moving = action.kind === 'move' || action.kind === 'page';
  const title = action.kind === 'create' ? (action.parentId === null ? 'New folder' : 'New subfolder') :
    action.kind === 'rename' ? 'Rename folder' : action.kind === 'delete' ? 'Delete folder' :
      action.kind === 'move' ? 'Move folder' : 'Move to folder';
  const options = moving ? [...folders.values()].map(folder => ({
    id: folder.id,
    trail: folderTrail(folders, folder.id),
  })).filter(({ trail }) => action.kind !== 'move' || !trail.some(folder => folder.id === action.folder.id))
    .map(({ id, trail }) => ({ id, title: trail.map(folder => folder.name).join(' / ') }))
    .sort(byLibraryTitle) : [];

  useEffect(() => { dialog.current?.showModal(); }, []);

  return (
    <dialog ref={dialog} className="wk-folder-dialog" aria-labelledby="wk-folder-dialog-title" onCancel={() => onDone()}>
      <form onSubmit={event => {
        event.preventDefault();
        if (naming && !name.trim()) return;
        const workspace = useDiagram.getState();
        switch (action.kind) {
          case 'create': workspace.createFolder(name, action.parentId); onDone(action.parentId); break;
          case 'rename': workspace.renameFolder(action.folder.id, name); onDone(); break;
          case 'move': workspace.moveFolder(action.folder.id, destination); onDone(destination); break;
          case 'page': workspace.movePageToFolder(action.page.id, destination); onDone(destination); break;
          case 'delete': workspace.deleteFolder(action.folder.id); onDone(action.folder.parentId); break;
        }
      }}>
        <h2 id="wk-folder-dialog-title">{title}</h2>
        {naming && <label>Folder name<input autoFocus required value={name} onChange={event => setName(event.target.value)} /></label>}
        {moving && <label>Destination
          <select autoFocus value={destination ?? ''} onChange={event => setDestination(event.target.value || null)}>
            <option value="">Top level</option>
            {options.map(folder => <option key={folder.id} value={folder.id}>{folder.title}</option>)}
          </select>
        </label>}
        {action.kind === 'delete' && <p>Delete “{action.folder.name}” and move its contents up one level.</p>}
        <div className="wk-folder-dialog-actions">
          <button className="wk-btn" type="button" onClick={() => onDone()}>Cancel</button>
          <button className="wk-btn" type="submit" disabled={naming && !name.trim()}>
            {action.kind === 'delete' ? 'Delete folder' : moving ? 'Move' : action.kind === 'create' ? 'Create folder' : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function WikiLibrary({ pageId, href, onOpen, onCreate }: {
  pageId: string | null;
  href: (id: string) => string;
  onOpen: () => void;
  onCreate: (folderId?: string) => void;
}) {
  const pages = useDiagram(state => state.pages);
  const folders = useDiagram(state => state.wikiFolders);
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<FolderAction | null>(null);
  const searchRegion = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const draggedPageId = useRef<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const model = useMemo(() => {
    const byId = new Map(folders.map(folder => [folder.id, folder]));
    const children = new Map<string | null, WikiFolder[]>();
    const pageParents = new Map<string, string>();
    const documents = new Map<string | null, Page[]>();
    const sortedPages = [...pages].sort(byLibraryTitle);
    const sortedFolders = [...folders].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    for (const folder of sortedFolders) {
      const siblings = children.get(folder.parentId) ?? [];
      siblings.push(folder);
      children.set(folder.parentId, siblings);
      for (const id of folder.pageIds) pageParents.set(id, folder.id);
    }
    for (const page of sortedPages) {
      const parent = pageParents.get(page.id) ?? null;
      const siblings = documents.get(parent) ?? [];
      siblings.push(page);
      documents.set(parent, siblings);
    }
    return { byId, children, pageParents, documents, sortedPages };
  }, [folders, pages]);
  const activeFolder = pageId === null ? null : model.pageParents.get(pageId) ?? null;
  const activeTrail = useMemo(() => folderTrail(model.byId, activeFolder), [model.byId, activeFolder]);
  const trailKey = JSON.stringify([pageId, ...activeTrail.map(folder => folder.id)]);
  const [lastTrail, setLastTrail] = useState('');
  if (lastTrail !== trailKey) {
    setLastTrail(trailKey);
    setOpen(previous => new Set([...previous, ...activeTrail.map(folder => folder.id)]));
  }

  const reveal = (id: string | null) => {
    if (id !== null && !model.byId.has(id)) return;
    setOpen(previous => new Set([...previous, ...folderTrail(model.byId, id).map(folder => folder.id)]));
  };
  const primaryClick = (event: MouseEvent) => {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) onOpen();
  };
  const endPageDrag = () => {
    draggedPageId.current = null;
    setDropFolderId(null);
  };
  const pageRow = (page: Page, showPath = false) => {
    const canMoveByDrag = !showPath && folders.length > 0;
    return (
      <li className="wk-library-row" key={page.id}>
        <a className={`wk-item${page.id === pageId ? ' on' : ''}`} href={href(page.id)} onClick={primaryClick}
          aria-current={page.id === pageId ? 'page' : undefined} title={libraryTitle(page)}
          draggable={canMoveByDrag || undefined}
          onDragStart={canMoveByDrag ? event => {
            event.dataTransfer.clearData();
            event.dataTransfer.setData(wikiPageDragType, page.id);
            event.dataTransfer.effectAllowed = 'move';
            draggedPageId.current = page.id;
          } : undefined}
          onDragEnd={endPageDrag}>
          <Icon name="page" size={14} />
          <span className="wk-library-name">{libraryTitle(page)}
            {showPath && <small>{folderTrail(model.byId, model.pageParents.get(page.id) ?? null).map(folder => folder.name).join(' / ') || 'Top level'}</small>}
          </span>
        </a>
        {folders.length > 0 && <Menu className="wk-icon" label={`Actions for ${libraryTitle(page)}`} button={<Icon name="more" size={14} />}>
          <button role="menuitem" onClick={() => setAction({ kind: 'page', page })}>Move to folder</button>
        </Menu>}
      </li>
    );
  };
  const tree = (parentId: string | null, depth = 0) => (
    <ul className="wk-tree-list" style={{ paddingInlineStart: depth > 0 && depth <= 8 ? 9 : 0 }}>
      {(model.children.get(parentId) ?? []).map(folder => (
        <li key={folder.id}>
          <div className={`wk-library-row${dropFolderId === folder.id ? ' drop-target' : ''}`}
            onDragOver={event => {
              const draggedId = draggedPageId.current;
              if (draggedId === null || model.pageParents.get(draggedId) === folder.id ||
                !event.dataTransfer.types.includes(wikiPageDragType)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropFolderId(folder.id);
            }}
            onDragLeave={event => {
              if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
              setDropFolderId(previous => previous === folder.id ? null : previous);
            }}
            onDrop={event => {
              const draggedId = draggedPageId.current;
              if (draggedId === null || event.dataTransfer.getData(wikiPageDragType) !== draggedId) return;
              event.preventDefault();
              endPageDrag();
              useDiagram.getState().movePageToFolder(draggedId, folder.id);
              reveal(folder.id);
            }}>
            <button className="wk-item" aria-expanded={open.has(folder.id)}
              onClick={() => setOpen(previous => {
                const next = new Set(previous);
                if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id);
                return next;
              })}>
              <span className={`wk-tree-chevron${open.has(folder.id) ? ' expanded' : ''}`} aria-hidden="true">›</span>
              <Icon name="folder" size={14} />
              <span>{folder.name}</span>
            </button>
            <Menu className="wk-icon" label={`Actions for ${folder.name}`} button={<Icon name="more" size={14} />}>
              <button role="menuitem" onClick={() => onCreate(folder.id)}>New page</button>
              <button role="menuitem" onClick={() => setAction({ kind: 'create', parentId: folder.id })}>New subfolder</button>
              <button role="menuitem" onClick={() => setAction({ kind: 'rename', folder })}>Rename folder</button>
              <button role="menuitem" onClick={() => setAction({ kind: 'move', folder })}>Move folder</button>
              <button role="menuitem" className="danger" onClick={() => setAction({ kind: 'delete', folder })}>Delete folder</button>
            </Menu>
          </div>
          {open.has(folder.id) && tree(folder.id, depth + 1)}
        </li>
      ))}
      {(model.documents.get(parentId) ?? []).map(page => pageRow(page))}
    </ul>
  );
  const results = query.trim() ? model.sortedPages.filter(page => matchesTitle(libraryTitle(page), query)) : null;
  return <>
    <div className="wk-library-actions" ref={searchRegion}>
      <LibrarySearch label="Search pages" value={query} onChange={setQuery} />
      <Menu label="New" align="end" button={<><Icon name="plus" size={14} /> New</>}>
        <button role="menuitem" onClick={() => onCreate()}>New page</button>
        <button role="menuitem" onClick={() => setAction({ kind: 'create', parentId: null })}>New folder</button>
      </Menu>
    </div>
    <nav className="wk-navigation" aria-label="Wiki pages">
      {results ? (
        results.length > 0 ? <ul className="wk-tree-list">{results.map(page => pageRow(page, true))}</ul> :
          <p className="wk-index-empty" role="status">No matching pages</p>
      ) : pages.length || folders.length ? tree(null) : <p className="wk-index-empty">No pages yet</p>}
    </nav>
    {action && <FolderDialog action={action} folders={model.byId} onDone={id => {
      if (id !== undefined) reveal(id);
      setAction(null);
      requestAnimationFrame(() => searchRegion.current?.querySelector<HTMLInputElement>('input')?.focus());
    }} />}
  </>;
}
