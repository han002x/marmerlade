// Per-element styles for sequence diagrams, kept beside the Mermaid source (Mermaid has no
// per-element style syntax for sequences). Participants are keyed by id (`p:<id>`); every
// other statement by its index in `statements()` (`s:<index>`). Source edits shift those
// indexes, so styles are re-matched to the edited statements, like flowchart edges are.
import type { ElementStyle } from '../types';
import { participants, statements, type Statement } from './model.ts';

export type SequenceStyles = Record<string, ElementStyle>;

/** Statements that can carry a style of their own. */
const styleable = new Set(['message', 'note', 'loop', 'alt', 'opt', 'par', 'par_over', 'critical', 'break', 'rect', 'box']);

/** Style key of a participant. */
export const actorKey = (id: string) => 'p:' + id;

/** Style key of a statement, or undefined when it has no stylable shape. */
export function statementKey(rows: Statement[], row: Statement): string | undefined {
  if (row.kind === 'participant') return actorKey(row.values[0]);
  if (!styleable.has(row.kind)) return undefined;
  const index = rows.indexOf(row);
  return index < 0 ? undefined : 's:' + index;
}

const signature = (row: Statement) => row.kind + '\u0000' + row.text;

/**
 * Pair statements of two versions of a source: unchanged statements first (longest common
 * subsequence), then moved statements with identical text, then edited statements of the
 * same kind in the same gap between unchanged ones.
 */
export function matchStatements(before: Statement[], after: Statement[]): Map<number, number> {
  const n = before.length;
  const m = after.length;
  const pairs = new Map<number, number>();
  const used = new Set<number>();
  const anchors: [number, number][] = [];
  if (n * m <= 4_000_000) {
    const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        table[i][j] =
          signature(before[i]) === signature(after[j])
            ? table[i + 1][j + 1] + 1
            : Math.max(table[i + 1][j], table[i][j + 1]);
    for (let i = 0, j = 0; i < n && j < m; ) {
      if (signature(before[i]) === signature(after[j])) {
        anchors.push([i, j]);
        i++;
        j++;
      } else if (table[i + 1][j] >= table[i][j + 1]) i++;
      else j++;
    }
  }
  for (const [i, j] of anchors) {
    pairs.set(i, j);
    used.add(j);
  }
  // Moved statements keep their text.
  const free = new Map<string, number[]>();
  after.forEach((row, j) => {
    if (used.has(j)) return;
    const list = free.get(signature(row)) ?? [];
    list.push(j);
    free.set(signature(row), list);
  });
  before.forEach((row, i) => {
    if (pairs.has(i)) return;
    const j = free.get(signature(row))?.shift();
    if (j === undefined) return;
    pairs.set(i, j);
    used.add(j);
  });
  // Edited statements stay between the same unchanged neighbours.
  const bounds: [number, number][] = [[-1, -1], ...anchors, [n, m]];
  for (let k = 1; k < bounds.length; k++) {
    const [i0, j0] = bounds[k - 1];
    const [i1, j1] = bounds[k];
    let j = j0 + 1;
    for (let i = i0 + 1; i < i1; i++) {
      if (pairs.has(i)) continue;
      while (j < j1 && (used.has(j) || after[j].kind !== before[i].kind)) j++;
      if (j >= j1) break;
      pairs.set(i, j);
      used.add(j);
      j++;
    }
  }
  return pairs;
}

/** Carry styles from `before` to `after`, dropping those whose element is gone. */
export function remapSequenceStyles(
  before: string | undefined,
  after: string | undefined,
  styles: SequenceStyles | undefined,
): SequenceStyles {
  if (!styles || !Object.keys(styles).length) return {};
  if (before === after) return styles;
  const old = statements(before ?? '');
  const next = statements(after ?? '');
  const pairs = matchStatements(old, next);
  const oldIds = new Set(participants(old));
  const newIds = new Set(participants(next));
  const gone = [...oldIds].filter((id) => !newIds.has(id));
  const added = [...newIds].filter((id) => !oldIds.has(id));
  const out: SequenceStyles = {};
  for (const [key, style] of Object.entries(styles)) {
    if (key.startsWith('p:')) {
      let id = key.slice(2);
      if (!newIds.has(id)) {
        // A renamed participant: its declaration was edited in place, or it was the only one renamed.
        const i = old.findIndex((row) => row.kind === 'participant' && row.values[0] === id);
        const j = i < 0 ? undefined : pairs.get(i);
        if (j !== undefined && next[j].kind === 'participant') id = next[j].values[0];
        else if (gone.length === 1 && added.length === 1) id = added[0];
      }
      if (newIds.has(id)) out[actorKey(id)] = style;
    } else if (key.startsWith('s:')) {
      const j = pairs.get(Number(key.slice(2)));
      if (j !== undefined) out['s:' + j] = style;
    }
  }
  return out;
}
