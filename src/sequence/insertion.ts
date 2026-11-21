import { blocks, statements, type Statement } from './model';
import type { CanvasEdit } from './canvasEdits';

/** Insert at a source boundary, preserving the surrounding statements and comments. */
export function insertElement(
  source: string,
  text: string,
  kind: string,
  at = source.length,
  selected: Statement[] = [],
): CanvasEdit {
  if (blocks.includes(kind) && selected.length) {
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
  const depth = following ? following.depth + (following.kind === 'end' ? 1 : 0) : (preceding?.depth ?? 0);
  const indent = '  '.repeat(depth + 1);
  const lineStart = source.lastIndexOf('\n', at - 1) + 1;
  let cut = following?.start === at && /^\s*$/.test(source.slice(lineStart, at)) ? lineStart : at;
  if (!following) cut += /^[ \t]*(?:(?:%%|#)[^\n]*)?\r?\n/.exec(source.slice(at))?.[0].length ?? 0;
  const before = source.slice(0, cut),
    after = source.slice(cut);
  const gap = before.endsWith('\n') ? '' : '\n';
  const body =
    indent + text.replaceAll('\n', '\n' + indent) + (blocks.includes(kind) ? '\n' + indent + 'end' : '');
  return {
    source: before + gap + body + (after || source.endsWith('\n') ? '\n' : '') + after,
    at: cut + gap.length + indent.length,
  };
}
