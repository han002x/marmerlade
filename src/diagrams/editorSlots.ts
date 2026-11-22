import type { ReactNode } from 'react';

export interface EditorSlots {
  diagramId: string;
  workspaceZoom: number;
  toolbar: HTMLElement | null;
  /** Board-level host for the flowchart style panel, outside the zoomed editor frame. */
  stylePanel: HTMLElement | null;
  drafts: Map<string, string>;
  workspaceActions: ReactNode;
  onImport: () => void;
}

export type SequenceTarget = { kind: 'participant'; id: string } | { kind: 'statement'; start: number };
