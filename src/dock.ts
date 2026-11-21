// Which view the right-hand panel shows, shared so a node's page button or the
// W key can bring up its page from anywhere on the canvas.

import { create } from 'zustand';
import { useDiagram } from './store.ts';

export type View = 'mermaid' | 'tree' | 'page' | 'slides' | 'appearance';

interface Dock {
  open: boolean;
  view: View;
  /** page tab: rich text, reading, or Markdown source; kept across pages */
  mode: 'edit' | 'read' | 'source';
  page: { selection: string | undefined; id: string } | null;
  /** slides tab: the deck on show, and whether as slides or as its Markdown */
  deck: { selection: string | undefined; id: string } | null;
  deckMode: 'slides' | 'source';
  setDeck: (id: string | null) => void;
  setDeckMode: (mode: 'slides' | 'source') => void;
  setPage: (id: string | null) => void;
  setMode: (mode: 'edit' | 'read' | 'source') => void;
  setOpen: (open: boolean) => void;
  setView: (view: View) => void;
}

export const useDock = create<Dock>((set) => ({
  open: true,
  view: 'mermaid',
  mode: 'edit',
  page: null,
  deck: null,
  deckMode: 'slides',
  setDeck: (id) => set({ deck: id ? { selection: useDiagram.getState().selectedNodeIds[0], id } : null }),
  setDeckMode: (deckMode) => set({ deckMode }),
  setPage: (id) => set({ page: id ? { selection: useDiagram.getState().selectedNodeIds[0], id } : null }),
  setMode: (mode) => set({ mode }),
  setOpen: (open) => set({ open }),
  setView: (view) => set({ view }),
}));

useDiagram.subscribe((state, previous) => {
  if (state.selectedNodeIds[0] !== previous.selectedNodeIds[0]) useDock.setState({ page: null, deck: null });
});

/** Inspect the links on a node. Only an explicit authoring action creates a document. */
export function showDeck(nodeId: string, deckId?: string) {
  const st = useDiagram.getState();
  const node = st.nodes.find((n) => n.id === nodeId);
  if (!node || (deckId && !node.deckIds?.includes(deckId))) return;
  const id = deckId ?? node.deckIds?.[0];
  st.setSelection([nodeId], []);
  useDock.setState({ open: true, view: 'slides', deck: id ? { selection: nodeId, id } : null });
}

export function showPage(nodeId: string, pageId?: string) {
  const st = useDiagram.getState();
  const node = st.nodes.find((n) => n.id === nodeId);
  if (!node || (pageId && !node.pageIds?.includes(pageId))) return;
  const id = pageId ?? node.pageIds?.[0];
  st.setSelection([nodeId], []);
  useDock.setState({ open: true, view: 'page', page: id ? { selection: nodeId, id } : null });
}
