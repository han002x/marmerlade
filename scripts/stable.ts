// Referential stability check: equal entries keep their previous object.
// Run with: node --experimental-strip-types scripts/stable.ts
import assert from 'node:assert/strict';
import { reuse, same, structural } from '../src/stable.ts';

const node = (id: string, x: number, label = id) => ({
  id, position: { x, y: 0 }, selected: false, data: { label, style: { stroke: 'red' } },
});

assert.ok(same(node('a', 1), node('a', 1)));
assert.ok(!same(node('a', 1), node('a', 2)));
assert.ok(!same(node('a', 1), node('a', 1, 'other')));
assert.ok(!same({ a: [1] }, { a: {} }));
// beyond the depth limit, objects compare by reference
assert.ok(!same({ a: { b: { c: {} } } }, { a: { b: { c: {} } } }, 3));

{
  const cache = new Map<string, ReturnType<typeof node>>();
  const first = reuse(cache, [node('a', 1), node('b', 2)]);
  const second = reuse(cache, [node('a', 1), node('b', 5)]);
  assert.equal(second[0], first[0], 'unchanged entry keeps its object');
  assert.notEqual(second[1], first[1], 'moved entry is replaced');
  assert.equal(second[1].position.x, 5);
  const third = reuse(cache, [node('b', 5)]);
  assert.equal(third[0], second[1]);
  assert.equal(cache.size, 1, 'removed entries leave the cache');
}

{
  const view = structural<ReturnType<typeof node>>();
  const a = node('a', 1);
  const b = node('b', 2);
  const first = view([a, b]);
  // moving a node keeps the view's identity
  assert.equal(view([{ ...a, position: { x: 9, y: 9 } }, b]), first);
  // a label change, an added node, or a reorder produces a new view
  const renamed = view([{ ...a, data: { ...a.data, label: 'x' } }, b]);
  assert.notEqual(renamed, first);
  assert.equal(renamed[1], first[1], 'untouched nodes keep their object');
  assert.notEqual(view([...renamed, node('c', 3)]), renamed);
  const reordered = view([b, renamed[0]]);
  assert.notEqual(reordered, renamed);
}

console.log('stable ok');
