// Which view the right-hand panel shows, shared so a node's page button or the
// W key can bring up its page from anywhere on the canvas.

import { create } from 'zustand';
import { linkOwner, useDiagram } from './store.ts';
import { parseParticipantOwner } from './linkOwners.ts';

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
  /**
   * owner id (linkOwners.ts) of the participant selected in the open sequence
   * diagram; the page and slides tabs show its links instead of a node's
   */
  participant: string | null;
  setParticipant: (id: string | null) => void;
  setDeck: (id: string | null) => void;
  setDeckMode: (mode: 'slides' | 'source') => void;
  setPage: (id: string | null) => void;
  setMode: (mode: 'edit' | 'read' | 'source') => void;
  setOpen: (open: boolean) => void;
  setView: (view: View) => void;
}

/** What the page and slides tabs show links of: the selected participant, else the selected node. */
export const selectedOwner = (): string | undefined =>
  useDock.getState().participant ?? useDiagram.getState().selectedNodeIds[0];

export const useDock = create<Dock>((set) => ({
  open: true,
  view: 'tree',
  mode: 'edit',
  page: null,
  deck: null,
  deckMode: 'slides',
  participant: null,
  setParticipant: (participant) =>
    set((s) => (s.participant === participant ? s : { participant, page: null, deck: null })),
  setDeck: (id) => set({ deck: id ? { selection: selectedOwner(), id } : null }),
  setDeckMode: (deckMode) => set({ deckMode }),
  setPage: (id) => set({ page: id ? { selection: selectedOwner(), id } : null }),
  setMode: (mode) => set({ mode }),
  setOpen: (open) => set({ open }),
  setView: (view) => set({ view }),
}));

useDiagram.subscribe((state, previous) => {
  if (state.selectedNodeIds[0] !== previous.selectedNodeIds[0]) useDock.setState({ page: null, deck: null });
  // a participant only stays selected while its sequence is the open diagram
  const participant = useDock.getState().participant;
  if (participant && state.activeDiagramId !== previous.activeDiagramId) {
    const id = parseParticipantOwner(participant)?.diagramId;
    if (id !== (state.activeDiagramId ?? 'sequence')) useDock.getState().setParticipant(null);
  }
});

/** Select a node or participant for the page and slides tabs. */
function selectOwner(ownerId: string) {
  if (parseParticipantOwner(ownerId)) {
    useDiagram.getState().setSelection([], []);
    useDock.getState().setParticipant(ownerId);
  } else {
    useDock.getState().setParticipant(null);
    useDiagram.getState().setSelection([ownerId], []);
  }
}

/** Inspect the links on a node or participant. Only an explicit authoring action creates a document. */
export function showDeck(nodeId: string, deckId?: string) {
  const node = linkOwner(nodeId);
  if (!node || (deckId && !node.deckIds?.includes(deckId))) return;
  const id = deckId ?? node.deckIds?.[0];
  selectOwner(nodeId);
  useDock.setState({ open: true, view: 'slides', deck: id ? { selection: nodeId, id } : null });
}

export function showPage(nodeId: string, pageId?: string) {
  const node = linkOwner(nodeId);
  if (!node || (pageId && !node.pageIds?.includes(pageId))) return;
  const id = pageId ?? node.pageIds?.[0];
  selectOwner(nodeId);
  useDock.setState({ open: true, view: 'page', page: id ? { selection: nodeId, id } : null });
}
