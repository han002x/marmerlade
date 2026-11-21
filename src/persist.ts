import { parseDiagram } from './workspaceSchema.ts';
import { validateSequence } from './sequence/model.ts';
// Diagram persistence: autosave to localStorage, restore on load, and
// file-based export/import. Keeps the "open and build, come back later"
// promise — nothing is lost on refresh.

import type { Diagram } from './types';
import { isLiveWorkspace } from './liveWorkspace.ts';
import { useDiagram, workspaceDiagram } from './store.ts';
import { normalizeDiagram } from './pages.ts';

const KEY = 'marmerlade.diagram';
const VERSION = 3;
let applyingRemote = false;

interface Saved {
  version: number;
  diagram: Diagram;
}

function removeSampleWalkthrough(diagram: Diagram): Diagram {
  const { decks = [] } = diagram;
  const sampleBody = [
    '## A request starts in the browser\n\n{{diagram:UI}}',
    '## The gateway routes it\n\n{{diagram:API}}',
    '## The backend checks identity\n\n{{diagram:Auth}}',
  ].join('\n\n---\n\n');
  const sample = decks.find((deck) => deck.id === 'follow-request' && deck.updatedAt === 1 &&
    deck.title === 'Follow a request' && deck.body === sampleBody);
  if (!sample) return diagram;
  return {
    ...diagram,
    decks: decks.filter((deck) => deck.id !== sample.id),
    nodes: diagram.nodes.map((node) => node.deckIds?.includes(sample.id)
      ? { ...node, deckIds: node.deckIds.filter((id) => id !== sample.id) }
      : node),
  };
}

export function readSaved(): Diagram | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Saved;
    if (![1, 2, VERSION, 4, 5].includes(parsed.version) || !parsed.diagram) return null;
    return removeSampleWalkthrough(parseDiagram(parsed.diagram));
  } catch {
    return null;
  }
}

export function write(diagram: Diagram) {
  if (isLiveWorkspace()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: diagram.diagrams ? 5 : diagram.sequence === undefined ? VERSION : 4, diagram: normalizeDiagram(diagram) }));
  } catch {
    // storage full or disabled — autosave is best-effort, never fatal
  }
}

/** Flush the debounce before another route or window restores this workspace. */
export function saveForNavigation() {
  write(workspaceDiagram());
}

/** Subscribe the store to localStorage with a debounce. Call once at startup. */
export function startAutosave(debounceMs = 400): () => void {
  if (isLiveWorkspace()) return () => {};
  let timer: number | undefined;
  const flush = () => {
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timer = undefined;
    saveForNavigation();
  };
  window.addEventListener('pagehide', flush);
  const unsubscribe = useDiagram.subscribe((state, prev) => {
    // hover and selection changes are not part of the saved document
    if (applyingRemote) return;
    if (state.wikiFolders !== prev.wikiFolders) {
      window.clearTimeout(timer);
      timer = undefined;
      write(workspaceDiagram(state));
      return;
    }
    if (state.diagrams === prev.diagrams && state.sequence === prev.sequence && state.nodes === prev.nodes && state.edges === prev.edges && state.pages === prev.pages && state.decks === prev.decks) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, debounceMs);
  });
  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', flush);
    flush();
  };
}

/** Follow the other window's saves. Call once at startup. */
export function startSync(): () => void {
  if (isLiveWorkspace()) return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    const saved = readSaved();
    if (!saved) return;
    // Another tab may be editing the other canvas inside our autosave debounce.
    // A sequence-only save carries a snapshot of the flowchart it last saw.
    let previous: Diagram | undefined;
    try { previous = e.oldValue ? JSON.parse(e.oldValue).diagram : undefined; } catch { /* Legacy or missing snapshot. */ }
    const local = useDiagram.getState();
    if(saved.diagrams){applyingRemote=true;try{local.applyRemote(saved);}finally{applyingRemote=false;}return;}
    if (previous && previous.sequence === saved.sequence) saved.sequence = local.sequence;
    if (previous && previous.sequence !== saved.sequence &&
        JSON.stringify([previous.nodes, previous.edges]) === JSON.stringify([saved.nodes, saved.edges])) {
      saved.nodes = local.nodes;
      saved.edges = local.edges;
    }
    applyingRemote = true;
    try { local.applyRemote(saved); }
    finally { applyingRemote = false; }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/** Download the current diagram as a .marmerlade.json file. */
export function exportFile() {
  const diagram = workspaceDiagram();
  const payload: Saved = { version: diagram.diagrams ? 5 : diagram.sequence === undefined ? VERSION : 4, diagram };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'diagram.marmerlade.json';
  a.click();
  URL.revokeObjectURL(url);
}

/** Read a .marmerlade.json file and load it onto the canvas. */
export async function importFile(file: File): Promise<void> {
  const text = await file.text();
  const parsed = JSON.parse(text) as Saved | Diagram;
  const diagram = 'diagram' in parsed ? parsed.diagram : parsed;
  if (!Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
    throw new Error('Not a marmerlade diagram file');
  }
  if (diagram.sequence !== undefined) {
    await validateSequence(diagram.sequence);
  }
  const valid=parseDiagram(diagram);
  for(const entity of valid.diagrams ?? []) if(entity.kind==='sequence')await validateSequence(entity.source);
  useDiagram.getState().load(valid);
}
