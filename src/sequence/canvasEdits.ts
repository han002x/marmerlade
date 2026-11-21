import { format, lifetimeIssue, participants, referencedActors, statements, type Statement } from './model';

export interface CanvasEdit {
  source: string;
  at: number;
}
export function appendStatement(source: string, text: string): CanvasEdit {
  const prefix = source.endsWith('\n') ? source : source + '\n';
  return { source: prefix + '  ' + text, at: prefix.length + 2 };
}

export function appendMessage(source: string, from: string, to: string, label: string): CanvasEdit {
  const edit = appendStatement(source, from + '->>' + to + ':' + (label ? ' ' + label : ''));
  const issue = lifetimeIssue(statements(edit.source));
  if (issue) throw new Error(issue);
  return edit;
}

function replace(source: string, row: Statement, text: string): CanvasEdit {
  return { source: source.slice(0, row.start) + text + source.slice(row.end), at: row.start };
}

// Declarations may be implicit. Write them at their first use so a canvas
// reorder changes lane order without moving any messages in time.
function declareLanes(source: string, rows: Statement[], lanes: string[], declarations: string[]): CanvasEdit {
  const affected = new Set(lanes);
  const first = rows.find((row) => referencedActors(row).some((id) => affected.has(id)));
  if (!first) return appendStatement(source, declarations.join('\n  '));
  const declarationsToMove = rows.filter((row) => row.kind === 'participant' && affected.has(row.values[0]));
  const box = (row: Statement) => (row.parent?.kind === 'box' ? row.parent : undefined);
  const crossesBox = lanes.some((id) => {
    const introduction = rows.find((row) => referencedActors(row).includes(id));
    return introduction && box(introduction) !== box(first);
  });
  if (crossesBox || declarationsToMove.some((row) => !!row.values[4] || box(row) !== box(first)))
    throw new Error(
      'Reorder participants within the same box and keep created participants at their creation message.',
    );
  if (new Set(declarationsToMove.map((row) => row.values[0])).size !== declarationsToMove.length)
    throw new Error('Reorder participants with repeated declarations in the Mermaid source.');
  // A message can introduce both lanes. Keep its implicit sender ahead of the moved lanes.
  const earlier = new Set(participants(rows.slice(0, rows.indexOf(first))));
  const leading = referencedActors(first)
    .slice(
      0,
      referencedActors(first).findIndex((id) => affected.has(id)),
    )
    .filter((id) => !earlier.has(id))
    .map((id) => 'participant ' + id);
  const indent = /^[ \t]*/.exec(source.slice(source.lastIndexOf('\n', first.start - 1) + 1, first.start))![0];
  const text = [...leading, ...declarations].join('\n' + indent);
  if (
    declarationsToMove.length === lanes.length &&
    declarations.length === lanes.length &&
    lanes.every(
      (id, i) =>
        declarationsToMove[i]?.values[0] === id &&
        rows.find((row) => referencedActors(row).includes(id)) === declarationsToMove[i],
    )
  ) {
    for (let i = declarationsToMove.length - 1; i >= 0; i--)
      source = replace(source, declarationsToMove[i], declarations[i]).source;
    return { source, at: first.start };
  }
  for (const row of declarationsToMove.toReversed()) {
    if (row === first) return replace(source, first, text);
    const range = statementRange(source, row.start, row.end);
    source = source.slice(0, range.start) + source.slice(range.end);
  }
  return {
    source: source.slice(0, first.start) + text + '\n' + indent + source.slice(first.start),
    at: first.start,
  };
}

const declaration = (rows: Statement[], id: string) =>
  rows.find((row) => row.kind === 'participant' && row.values[0] === id)?.text ?? 'participant ' + id;

function selectLane(edit: CanvasEdit, id: string): CanvasEdit {
  const declaration = statements(edit.source).find((row) => row.kind === 'participant' && row.values[0] === id);
  return { source: edit.source, at: declaration?.start ?? edit.at };
}

export function moveLane(source: string, rows: Statement[], from: string, to: string): CanvasEdit {
  const ids = participants(rows);
  const a = ids.indexOf(from),
    b = ids.indexOf(to);
  const lanes = ids.slice(Math.min(a, b), Math.max(a, b) + 1);
  const sorted = lanes.filter((id) => id !== from);
  sorted.splice(b > a ? sorted.length : 0, 0, from);
  return selectLane(
    declareLanes(
      source,
      rows,
      lanes,
      sorted.map((id) => declaration(rows, id)),
    ),
    from,
  );
}

export function insertParticipant(
  source: string,
  rows: Statement[],
  before: string | undefined,
  label: string,
): CanvasEdit {
  const ids = participants(rows);
  let index = 1;
  while (ids.includes('P' + index)) index++;
  const id = 'P' + index;
  const text = format('participant', [id, label, 'participant', '', '']);
  if (!before) return appendStatement(source, text);
  const first = rows.find((row) => referencedActors(row).includes(before))!;
  const lanes = referencedActors(first).filter(
    (id, i, a) => a.indexOf(id) === i && rows.find((row) => referencedActors(row).includes(id)) === first,
  );
  const decls = lanes.map((id) => declaration(rows, id));
  decls.splice(lanes.indexOf(before), 0, text);
  return selectLane(declareLanes(source, rows, lanes, decls), id);
}

export function changeLabel(
  source: string,
  rows: Statement[],
  row: Statement | undefined,
  actor: string | undefined,
  label: string,
): CanvasEdit {
  if (actor) row = rows.find((r) => r.kind === 'participant' && r.values[0] === actor);
  if (!row && actor) {
    const first = rows.find((r) => referencedActors(r).includes(actor))!;
    const lanes = [...new Set(referencedActors(first))].filter(
      (id) => rows.find((r) => referencedActors(r).includes(id)) === first,
    );
    return selectLane(
      declareLanes(
        source,
        rows,
        lanes,
        lanes.map((id) =>
          id === actor ? format('participant', [id, label, 'participant', '', '']) : declaration(rows, id),
        ),
      ),
      actor,
    );
  }
  if (!row) throw new Error('Select an element to edit its label.');
  const values = [...row.values];
  const field = row.kind === 'participant' ? 1 : row.kind === 'message' ? 3 : row.kind === 'note' ? 2 : 0;
  values[field] = label;
  return replace(source, row, format(row.kind, values));
}

// Include indentation and the line break only when the statement owns its entire line.
// Semicolon-separated statements and adjacent comments keep their original separators.
function statementRange(source: string, start: number, end: number) {
  const line = source.lastIndexOf('\n', start - 1) + 1;
  const newline = source.indexOf('\n', end);
  const tail = newline < 0 ? source.length : newline;
  if (/^[ \t]*$/.test(source.slice(line, start)) && /^[ \t\r]*$/.test(source.slice(end, tail))) {
    return { start: line, end: newline < 0 ? tail : newline + 1 };
  }
  return { start, end };
}

function relocateMessage(source: string, row: Statement, to: Statement): CanvasEdit {
  const range = statementRange(source, row.start, row.end);
  const after = row.start < to.start;
  const cut = after ? to.end - (range.end - range.start) : to.start;
  const without = source.slice(0, range.start) + source.slice(range.end);
  const line = source.lastIndexOf('\n', to.start - 1) + 1;
  const indent = /^[ \t]*/.exec(source.slice(line, to.start))![0];
  const gap = '\n' + indent;
  const insertion = after ? gap + row.text : row.text + gap;
  return { source: without.slice(0, cut) + insertion + without.slice(cut), at: cut + (after ? gap.length : 0) };
}
export function moveMessage(source: string, rows: Statement[], row: Statement, to: Statement): CanvasEdit {
  const [first, last] = row.start < to.start ? [row, to] : [to, row];
  if (
    row.parent !== to.parent ||
    rows.some(
      (r) =>
        r.start > first.start &&
        r.start < last.start &&
        r.parent === row.parent &&
        ['else', 'and', 'option'].includes(r.kind),
    )
  )
    throw new Error('Drop the message within its current branch.');
  let moved = relocateMessage(source, row, to);
  const order = participants(rows);
  const nextOrder = participants(statements(moved.source));
  const changed = order.filter((id, i) => nextOrder[i] !== id);
  if (changed.length) {
    // Reordering messages may change which message first introduces an implicit lane.
    const lanes = order.slice(order.indexOf(changed[0]), order.indexOf(changed.at(-1)!) + 1);
    const declared = declareLanes(
      source,
      rows,
      lanes,
      lanes.map((id) => declaration(rows, id)),
    );
    const messages = rows.filter((r) => r.kind === 'message');
    const revised = statements(declared.source).filter((r) => r.kind === 'message');
    moved = relocateMessage(declared.source, revised[messages.indexOf(row)], revised[messages.indexOf(to)]);
  }
  const issue = lifetimeIssue(statements(moved.source));
  if (issue) throw new Error(issue);
  return moved;
}

export function removeSelection(
  source: string,
  rows: Statement[],
  selectedRows: Statement[],
  actors: string[],
): CanvasEdit {
  const removedActors = new Set(actors);
  const selected = new Set(selectedRows);
  const ranges: { start: number; end: number }[] = [];
  for (const row of rows) {
    if (row.start < (ranges.at(-1)?.end ?? 0)) continue;
    if (selected.has(row) || referencedActors(row).some((id) => removedActors.has(id))) {
      ranges.push(statementRange(source, row.start, row.close?.end ?? row.end));
    }
  }
  for (const { start, end } of ranges.toReversed()) source = source.slice(0, start) + source.slice(end);
  return { source, at: source.length };
}
