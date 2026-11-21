import { Icon } from '../components/Icon';
import { TreePanel } from '../components/TreePanel';
import { participants, statements } from '../sequence/model';
import { summary } from '../sequence/selection';
import type { DiagramEntity } from '../types';
import type { SequenceTarget } from './editorSlots';

function InactiveSequence({ source, pick }: { source: string; pick: (target: SequenceTarget) => void }) {
  const rows = statements(source);
  const implicit = participants(rows).filter(
    (id) => !rows.some((row) => row.kind === 'participant' && row.values[0] === id),
  );
  return (
    <ul className="mf-tree-list">
      {implicit.map((id) => (
        <li key={id}>
          <button className="mf-tree-page" onClick={() => pick({ kind: 'participant', id })}>
            <span>Participant · {id}</span>
          </button>
        </li>
      ))}
      {rows
        .filter((row) => row.kind !== 'end')
        .map((row) => (
          <li key={row.start} style={{ paddingInlineStart: row.depth * 12 }}>
            <button className="mf-tree-page" onClick={() => pick({ kind: 'statement', start: row.start })}>
              {summary(row)}
            </button>
          </li>
        ))}
      {!rows.length && <li className="mf-tree-empty">No participants or messages</li>}
    </ul>
  );
}

export function WorkspaceTree({
  entities,
  active,
  open,
  pickSequence,
  sequenceOutline,
  expansion,
  setExpanded,
}: {
  entities: DiagramEntity[];
  active: string | null;
  open: (id: string) => void;
  pickSequence: (id: string, target: SequenceTarget) => void;
  sequenceOutline: (element: HTMLDivElement | null) => void;
  expansion: ReadonlyMap<string, boolean>;
  setExpanded: (id: string, expanded: boolean) => void;
}) {
  return (
    <nav className="mf-tree" aria-label="Diagram tree">
      {!entities.length && <p className="mf-tree-empty">No diagrams</p>}
      <ul className="mf-tree-list">
        {entities.map((entity) => {
          const current = active === entity.id;
          const title = entity.title || (entity.kind === 'flowchart' ? 'Flowchart' : 'Sequence');
          const expanded = expansion.get(entity.id) ?? current;
          const activate = () => {
            setExpanded(entity.id, true);
            open(entity.id);
          };
          return (
            <li key={entity.id}>
              <div className={'mf-tree-row' + (current ? ' selected' : '')}>
                <button
                  className="mf-tree-toggle"
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} diagram ${title}`}
                  aria-expanded={expanded}
                  onClick={() => setExpanded(entity.id, !expanded)}
                >
                  <span className={expanded ? 'mf-tree-chevron expanded' : 'mf-tree-chevron'}>›</span>
                </button>
                <button
                  className="mf-tree-page mf-diagram-tree-title"
                  aria-current={current}
                  onClick={activate}
                >
                  <Icon name={entity.kind === 'flowchart' ? 'group' : 'arrow'} size={14} />
                  <span>{title}</span>
                </button>
              </div>
              {entity.kind === 'sequence' && current ? (
                <div className="mf-diagram-tree-children" hidden={!expanded} ref={sequenceOutline} />
              ) : (
                expanded && (
                  <div className="mf-diagram-tree-children">
                    {entity.kind === 'flowchart' ? (
                      <TreePanel diagram={entity} activate={() => open(entity.id)} />
                    ) : (
                      <InactiveSequence
                        source={entity.source}
                        pick={(target) => {
                          activate();
                          pickSequence(entity.id, target);
                        }}
                      />
                    )}
                  </div>
                )
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
