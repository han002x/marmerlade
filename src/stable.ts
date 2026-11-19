// Referential stability for objects handed to React Flow. The canvas rebuilds
// its node and edge lists whenever anything changes; reusing the previous
// object for every entry that did not change lets memoized components skip.

/** Structural equality to a fixed depth; objects beyond it compare by reference. */
export function same(a: unknown, b: unknown, depth = 3): boolean {
  if (Object.is(a, b)) return true;
  if (depth === 0 || typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  return keys.every((k) => k in y && same(x[k], y[k], depth - 1));
}

/**
 * Returns `list` with each entry swapped for its previous object (by id) when
 * equal. `cache` holds the previous result and is updated in place.
 */
export function reuse<T extends { id: string }>(cache: Map<string, T>, list: T[], depth = 3): T[] {
  const out = list.map((item) => {
    const prev = cache.get(item.id);
    return prev && same(prev, item, depth) ? prev : item;
  });
  cache.clear();
  for (const item of out) cache.set(item.id, item);
  return out;
}

type Placed = { position?: unknown };

/**
 * A view of `nodes` that keeps its identity while nodes only move. For readers
 * that never look at positions (Mermaid text, the tree, the style panel), so a
 * drag does not re-run them. The returned nodes may carry stale positions.
 */
export function structural<T extends Placed>() {
  let input: T[] = [];
  let output: T[] = [];
  return (nodes: T[]): T[] => {
    if (nodes === input) return output;
    input = nodes;
    const prev = new Map(output.map((n) => [(n as T & { id: string }).id, n]));
    let changed = nodes.length !== output.length;
    const next = nodes.map((n, i) => {
      const old = prev.get((n as T & { id: string }).id);
      if (old && sameBesidesPosition(old, n)) {
        if (output[i] !== old) changed = true;
        return old;
      }
      changed = true;
      return n;
    });
    if (changed) output = next;
    return output;
  };
}

function sameBesidesPosition(a: Placed, b: Placed): boolean {
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  return keys.every((k) => k === 'position' || (k in y && Object.is(x[k], y[k])));
}
