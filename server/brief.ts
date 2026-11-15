import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { briefInputSchema, type Brief, type BriefInput } from '../src/briefSchema.ts';
import { parseDiagram } from '../src/workspaceSchema.ts';
import { mergeDiagram, parseMermaid } from '../src/mermaid/io.ts';
import { layout } from '../src/layout.ts';
import type { Diagram } from '../src/types.ts';
import { readRepositoryFile } from './repository.ts';

export async function prepareBrief(input: BriefInput, repository: string, basedOn: number, current: Diagram): Promise<Brief> {
  const content = briefInputSchema.parse(input);
  const root = await realpath(repository);
  for (const evidence of content.evidence) {
    const file = await readRepositoryFile(root, evidence.path);
    if (evidence.line > file.lines) throw new Error(`Evidence line is outside ${file.path}`);
    evidence.path = file.path;
  }
  const parsed = parseMermaid(content.source);
  if (!parsed.ok) throw new Error(parsed.error);
  if (parsed.diagram.nodes.length === 0) throw new Error('The brief needs at least one diagram node.');
  const diagram = mergeDiagram(parsed.diagram, current);
  diagram.pages = current.pages ?? [];
  diagram.decks = current.decks ?? [];
  const positions = layout(diagram.nodes, diagram.edges);
  diagram.nodes = diagram.nodes.map(node => ({ ...node, position: positions[node.id] ?? node.position }));
  diagram.edges = diagram.edges.map((edge, index) => ({ ...edge, order: index + 1 }));
  parseDiagram(diagram);
  const id = createHash('sha256').update(JSON.stringify({ content, diagram, repository: root, basedOn })).digest('hex');
  return { kind: 'draft', id, basedOn, repository: root, content, diagram: { ...diagram, pages: diagram.pages ?? [], decks: diagram.decks ?? [] } };
}
