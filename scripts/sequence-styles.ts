// Sequence styles follow their statements through source edits.
// Run with: node --experimental-strip-types scripts/sequence-styles.ts
import assert from 'node:assert/strict';
import { remapSequenceStyles } from '../src/sequence/styleMap.ts';

const red = { stroke: 'red' };
const blue = { background: 'blue' };
const base = ['sequenceDiagram', 'participant A', 'participant B', 'A->>B: one', 'B->>A: two', 'Note over A: n'].join('\n');
// rows: 0 participant A, 1 participant B, 2 one, 3 two, 4 note

// unchanged source keeps the same object
const styles = { 'p:A': red, 's:3': blue };
assert.equal(remapSequenceStyles(base, base, styles), styles);

// inserting a statement before shifts the index
assert.deepEqual(
  remapSequenceStyles(base, base.replace('A->>B: one', 'A->>B: zero\nA->>B: one'), { 's:3': blue }),
  { 's:4': blue },
);

// moving a message keeps its style
assert.deepEqual(
  remapSequenceStyles(base, base.replace('A->>B: one\nB->>A: two', 'B->>A: two\nA->>B: one'), { 's:2': red, 's:3': blue }),
  { 's:3': red, 's:2': blue },
);

// editing a message's label keeps its style
assert.deepEqual(remapSequenceStyles(base, base.replace('two', 'second'), { 's:3': blue }), { 's:3': blue });

// deleting a statement drops its style and shifts the rest
assert.deepEqual(
  remapSequenceStyles(base, base.replace('A->>B: one\n', ''), { 's:2': red, 's:4': blue }),
  { 's:3': blue },
);

// renaming a declared participant carries its style
assert.deepEqual(
  remapSequenceStyles(base, base.replaceAll('A', 'Alice'), { 'p:A': red, 'p:B': blue }),
  { 'p:Alice': red, 'p:B': blue },
);

// renaming an implicit participant carries its style
const implicit = 'sequenceDiagram\nX->>Y: hi';
assert.deepEqual(remapSequenceStyles(implicit, implicit.replace('X', 'Z'), { 'p:X': red }), { 'p:Z': red });

// removing a participant drops its style
assert.deepEqual(
  remapSequenceStyles(implicit, 'sequenceDiagram\nY->>Y: hi', { 'p:X': red, 'p:Y': blue }),
  { 'p:Y': blue },
);

console.log('sequence styles ok');
