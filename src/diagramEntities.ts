import type { Diagram, DiagramEntity } from './types';

export function diagramEntities(diagram: Diagram): DiagramEntity[] {
  if (diagram.diagrams) return diagram.diagrams;
  const flow: DiagramEntity = {
    id: 'flowchart',
    title: 'Flowchart',
    kind: 'flowchart',
    position: { x: 0, y: 0 },
    size: { width: 900, height: 650 },
    nodes: diagram.nodes,
    edges: diagram.edges,
  };
  return [
    flow,
    ...(diagram.sequence === undefined
      ? []
      : [
          {
            id: 'sequence',
            title: 'Sequence',
            kind: 'sequence' as const,
            position: { x: 1020, y: 0 },
            size: { width: 900, height: 650 },
            source: diagram.sequence,
          },
        ]),
  ];
}

/** A name no other diagram uses (case-insensitive): "Flow" becomes "Flow 2" when taken. */
export function uniqueTitle(entities: DiagramEntity[], id: string, wanted: string, fallback = 'Diagram'): string {
  const base = wanted.trim() || fallback;
  const taken = new Set(entities.filter((e) => e.id !== id).map((e) => e.title.trim().toLowerCase()));
  let title = base;
  for (let n = 2; taken.has(title.toLowerCase()); n++) title = `${base} ${n}`;
  return title;
}

/** Keep the original fields as a projection for older tools and node links. */
export function projectDiagrams(diagram: Diagram, diagrams: DiagramEntity[]): Diagram {
  const flow = diagrams.find((entity) => entity.kind === 'flowchart');
  const sequence = diagrams.find((entity) => entity.kind === 'sequence');
  const { sequence: previous, ...rest } = diagram;
  void previous;
  return {
    ...rest,
    diagrams,
    nodes: flow?.nodes ?? [],
    edges: flow?.edges ?? [],
    ...(sequence && { sequence: sequence.source }),
  };
}
