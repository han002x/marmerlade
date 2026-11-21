import { blocks, nameOf, participants, statements, type Statement } from './model';
import type { CanvasEdit } from './canvasEdits';

/** The selected statements a block can wrap: participants for a box, messages otherwise. */
export function wrappable(kind: string, selected: Statement[]) {
  if (!blocks.includes(kind)) return [];
  return selected.filter((row) => row.kind === (kind === 'box' ? 'participant' : 'message'));
}

/**
 * Mermaid cannot draw a block with nothing inside, so a new block starts with
 * one message the user can rename. It runs from the chosen lane to its neighbour.
 */
export function placeholderMessage(source: string, lane?: string) {
  const ids = participants(statements(source));
  if (!ids.length) return '';
  const from = lane && ids.includes(lane) ? lane : ids[0];
  const to = ids[ids.indexOf(from) + 1] ?? ids[ids.indexOf(from) - 1] ?? from;
  return from + '->>' + to + ': New step';
}

/** Insert at a source boundary, preserving the surrounding statements and comments. */
export function insertElement(
  source: string,
  text: string,
  kind: string,
  at = source.length,
  chosen: Statement[] = [],
  lane?: string,
): CanvasEdit {
  const selected = wrappable(kind, chosen);
  if (selected.length) {
    const rows = statements(source);
    const picks = selected
      .map((item) => rows.find((row) => row.start === item.start))
      .filter((row) => row !== undefined);
    const first = picks[0],
      last = picks.at(-1);
    if (!first || !last) throw new Error('Select a contiguous range to wrap.');
    const siblings = rows.filter((row) => row.start >= first.start && row.start <= last.start);
    const participantBox = kind === 'box';
    if (
      picks.length !== siblings.length ||
      siblings.some(
        (row) => row.parent !== first.parent || row.kind !== (participantBox ? 'participant' : 'message'),
      ) ||
      (!participantBox &&
        rows.some(
          (row) =>
            row.start > first.start && row.start < last.start && ['else', 'and', 'option'].includes(row.kind),
        ))
    )
      throw new Error(
        participantBox
          ? 'Select contiguous participants in the same box.'
          : 'Select contiguous messages in the same branch.',
      );
    const indent =
      /^[ \t]*/.exec(source.slice(source.lastIndexOf('\n', first.start - 1) + 1, first.start))?.[0] ?? '';
    const body = source.slice(first.start, last.end).replaceAll('\n', '\n  ');
    return {
      source:
        source.slice(0, first.start) +
        text +
        '\n' +
        indent +
        '  ' +
        body +
        '\n' +
        indent +
        'end' +
        source.slice(last.end),
      at: first.start,
    };
  }
  const rows = statements(source);
  const following = rows.find((row) => row.start >= at);
  const preceding = rows.filter((row) => row.end <= at).at(-1);
  const branch = ['else', 'and', 'option'].includes(kind);
  const depth = following
    ? following.depth + (following.kind === 'end' && !branch ? 1 : 0)
    : (preceding?.depth ?? 0);
  const indent = '  '.repeat(depth + 1);
  const lineStart = source.lastIndexOf('\n', at - 1) + 1;
  let cut = following?.start === at && /^\s*$/.test(source.slice(lineStart, at)) ? lineStart : at;
  if (!following) cut += /^[ \t]*(?:(?:%%|#)[^\n]*)?\r?\n/.exec(source.slice(at))?.[0].length ?? 0;
  const before = source.slice(0, cut),
    after = source.slice(cut);
  const gap = before.endsWith('\n') ? '' : '\n';
  const opensSection = (blocks.includes(kind) && kind !== 'box') || branch;
  const filler = opensSection ? placeholderMessage(source, lane) : '';
  const body =
    indent +
    text.replaceAll('\n', '\n' + indent) +
    (filler ? '\n' + indent + '  ' + filler : '') +
    (blocks.includes(kind) ? '\n' + indent + 'end' : '');
  return {
    source: before + gap + body + (after || source.endsWith('\n') ? '\n' : '') + after,
    at: cut + gap.length + indent.length,
  };
}

/**
 * Mermaid draws an activation bar only once it is closed. Close a new activation
 * after the participant's last message in the same branch, unless it is closed already.
 */
export function closeActivation(edit: CanvasEdit): CanvasEdit {
  const rows = statements(edit.source);
  const opened = rows.find((row) => row.start >= edit.at && row.kind === 'activate');
  if (!opened) return edit;
  const actor = opened.values[0].trim();
  const after = rows.slice(rows.indexOf(opened) + 1);
  const scope = after.filter((row) => row.parent === opened.parent);
  const stop = scope.findIndex(
    (row) => row.kind === 'end' || (['deactivate', 'activate'].includes(row.kind) && row.values[0].trim() === actor),
  );
  if (stop >= 0 && scope[stop].kind === 'deactivate') return edit;
  const span = stop < 0 ? scope : scope.slice(0, stop);
  const involved = (row: Statement) =>
    after.some((child) => child.start >= row.start && child.end <= (row.close?.end ?? row.end) && child.kind === 'message' && child.values.slice(0, 2).includes(actor));
  const last = span.filter(involved).at(-1);
  if (!last) return edit;
  const end = last.close?.end ?? last.end;
  const indent = /^[ \t]*/.exec(edit.source.slice(edit.source.lastIndexOf('\n', opened.start - 1) + 1, opened.start))?.[0] ?? '';
  return {
    source: edit.source.slice(0, end) + '\n' + indent + 'deactivate ' + actor + edit.source.slice(end),
    at: edit.at,
  };
}

/**
 * A representative example of an element in this diagram, for previewing a palette tile
 * before it is placed. Undefined when the element would not change the drawing.
 */
export function sampleEdit(source: string, kind: string, at = source.length, chosen: Statement[] = []) {
  const rows = statements(source);
  const ids = participants(rows);
  const [first, second = first] = ids;
  const messages = rows.filter((row) => row.kind === 'message');
  if (kind === 'participant') {
    let i = 1;
    while (ids.includes('P' + i)) i++;
    return insertElement(source, 'participant P' + i + ' as New participant', kind, source.length);
  }
  if (!first) return undefined;
  if (kind === 'message') return insertElement(source, first + '->>' + second + ': Message', kind, at);
  if (kind === 'note') return insertElement(source, 'Note over ' + first + ': Note', kind, at);
  if (kind === 'box') {
    const lanes = wrappable(kind, chosen);
    const row = rows.find((item) => item.kind === 'participant');
    if (!lanes.length && !row) return undefined;
    return insertElement(source, 'box Group', kind, at, lanes.length ? lanes : [row!]);
  }
  if (kind === 'rect') return insertElement(source, 'rect rgb(235, 241, 250)', kind, at, chosen);
  if (blocks.includes(kind)) return insertElement(source, kind + ' ' + nameOf(kind), kind, at, chosen);
  if (kind === 'activate') {
    const message = chosen.find((row) => row.kind === 'message') ?? messages[0];
    if (!message) return undefined;
    const actor = message.values[1];
    return closeActivation(insertElement(source, 'activate ' + actor, kind, message.start));
  }
  if (kind === 'destroy' && ids.length > 1)
    return insertElement(source, 'destroy ' + ids.at(-1) + '\n' + first + '->>' + ids.at(-1) + ': Close', kind, at);
  if (kind === 'autonumber' && messages.length) return insertElement(source, 'autonumber', kind, at);
  if (kind === 'title') return insertElement(source, 'title Title', kind, at);
  return undefined;
}
