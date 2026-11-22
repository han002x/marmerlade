// What pages and decks link to: a flowchart node, or a participant of a sequence
// diagram. Nodes keep their links in `pageIds` / `deckIds`; a sequence keeps its
// participants' links on the diagram entity (`links`), keyed by participant id,
// because Mermaid has no syntax for them. Pure: no store or DOM.

import type { DiagramEntity, DiagramNode, DocumentLinks } from './types';
import type { LinkKey } from './pages.ts';
import { participants, statements } from './sequence/model.ts';

/** Something documents link to, under one id: a node id, or a participant's owner id. */
export interface LinkOwner extends DocumentLinks {
  id: string;
  label: string;
}

type SequenceEntity = Extract<DiagramEntity, { kind: 'sequence' }>;

const PARTICIPANT = /^participant:([^:]+):([\s\S]+)$/;

/** The owner id of a sequence participant. Node ids never contain `:`, so the two cannot clash. */
export const participantOwner = (diagramId: string, actor: string) =>
  `participant:${encodeURIComponent(diagramId)}:${actor}`;

/** The diagram and participant an owner id names, or null for a node id. */
export function parseParticipantOwner(id: string): { diagramId: string; actor: string } | null {
  const m = PARTICIPANT.exec(id);
  if (!m) return null;
  try {
    return { diagramId: decodeURIComponent(m[1]), actor: m[2] };
  } catch {
    return null;
  }
}

/** A participant's display name: its alias, else its id. */
export function participantLabel(source: string, actor: string): string {
  const row = statements(source).find((r) => r.kind === 'participant' && r.values[0] === actor);
  return row?.values[1] || actor;
}

/** Every participant of a sequence diagram, with its links. */
export function participantOwners(entity: SequenceEntity): LinkOwner[] {
  const rows = statements(entity.source);
  return participants(rows).map((actor) => ({
    id: participantOwner(entity.id, actor),
    label: rows.find((r) => r.kind === 'participant' && r.values[0] === actor)?.values[1] || actor,
    ...entity.links?.[actor],
  }));
}

/** The node or participant `id` names, read from the live workspace. */
export function findOwner(id: string, nodes: DiagramNode[], entities: DiagramEntity[]): LinkOwner | undefined {
  const participant = parseParticipantOwner(id);
  if (!participant) return nodes.find((n) => n.id === id);
  const entity = entities.find((e) => e.id === participant.diagramId);
  if (entity?.kind !== 'sequence') return undefined;
  return { id, label: participantLabel(entity.source, participant.actor), ...entity.links?.[participant.actor] };
}

/** Every link owner in the workspace: the given nodes, then every sequence participant. */
export function allOwners(nodes: DiagramNode[], entities: DiagramEntity[]): LinkOwner[] {
  return [...nodes, ...entities.flatMap((e) => (e.kind === 'sequence' ? participantOwners(e) : []))];
}

/** `entity` with one participant's list of `key` replaced; empty lists and entries are dropped. */
export function setParticipantLinks(entity: SequenceEntity, actor: string, key: LinkKey, ids: string[]): SequenceEntity {
  const links = { ...entity.links };
  const entry: DocumentLinks = { ...links[actor], [key]: ids };
  if (!ids.length) delete entry[key];
  if (Object.keys(entry).length) links[actor] = entry;
  else delete links[actor];
  const { links: previous, ...rest } = entity;
  void previous;
  return Object.keys(links).length ? { ...rest, links } : rest;
}

/** `entity` without any link to document `id` in `key`. */
export function dropParticipantLinks(entity: SequenceEntity, key: LinkKey, id: string): SequenceEntity {
  let next = entity;
  for (const [actor, entry] of Object.entries(entity.links ?? {}))
    if (entry[key]?.includes(id)) next = setParticipantLinks(next, actor, key, entry[key].filter((d) => d !== id));
  return next;
}
