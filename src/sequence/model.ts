// Source ranges let a visual edit replace one statement without reprinting its neighbours.
export const header = 'sequenceDiagram';
export function isSequence(source: string) {
  if (typeof source !== 'string') return false;
  const body = source.trimStart().replace(/^---[^\n]*\n[\s\S]*?\n---[^\n]*(?:\n|$)/, '');
  return /^sequenceDiagram\b/i.test(body.replace(/^(?:\s+|%%\{[\s\S]*?\}%%|%%[^\n]*)+/, ''));
}

const half = ['-|\\', '-|/', '-\\\\', '-//', '/|-', '\\|-', '//-', '\\\\-'];
export const arrows = [
  '->>',
  '-->>',
  '->',
  '-->',
  '-x',
  '--x',
  '-)',
  '--)',
  '<<->>',
  '<<-->>',
  ...half,
  ...half.map((a) => a.replace('-', '--')),
];
const arrowPattern = arrows
  .toSorted((a, b) => b.length - a.length)
  .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
const signal = new RegExp('^(.+?)(\\(\\))?(' + arrowPattern + ')(\\(\\)|[+-])?([^:]+):(.*)$', 'is');
export const blocks = ['box', 'loop', 'opt', 'alt', 'par', 'par_over', 'critical', 'break', 'rect'];
export const branches: Record<string, string> = {
  alt: 'else',
  par: 'and',
  par_over: 'and',
  critical: 'option',
};
export interface Statement {
  start: number;
  end: number;
  line: number;
  text: string;
  kind: string;
  values: string[];
  depth: number;
  parent?: Statement;
  close?: Statement;
}

function classify(text: string): [string, string[]] {
  let m = /^(create\s+)?(participant|actor)\s+(.+?)(?:@\{([\s\S]*?)\})?(?:\s+as\s+(.+))?$/i.exec(text);
  if (m) return ['participant', [m[3], m[5] ?? '', m[2].toLowerCase(), m[4] ?? '', m[1] ? 'create' : '']];
  m = /^note\s+(over|left of|right of)\s+([^:]+):\s*(.*)$/is.exec(text);
  if (m) return ['note', [m[1].toLowerCase(), m[2].trim(), m[3]]];
  m = /^(link|links|properties|details)\s+([^:]+):\s*(.*)$/is.exec(text);
  if (m) return [m[1].toLowerCase(), [m[2].trim(), m[3]]];
  m = /^(title|accTitle|accDescr)(?:\s*:\s*|\s+|(?=\{))([\s\S]*)$/i.exec(text);
  if (m) return [m[1].toLowerCase(), [m[2].replace(/^\{([\s\S]*)\}$/, '$1')]];
  const keyword =
    /^(loop|alt|opt|par_over|par|critical|break|rect|box|else|and|option|activate|deactivate|destroy|autonumber)(?:\s+([\s\S]*))?$/i.exec(
      text,
    );
  if (keyword) return [keyword[1].toLowerCase(), [keyword[2] ?? '']];
  m = signal.exec(text);
  if (m) return ['message', [m[1].trim(), m[5].trim(), m[3], m[6].trimStart(), m[2] ?? '', m[4] ?? '']];
  const [, kind, rest] = /^(\S+)(?:\s+([\s\S]*))?$/.exec(text)!;
  return [kind.toLowerCase(), [rest ?? '']];
}

export function statements(source: string): Statement[] {
  const rows: Statement[] = [];
  const stack: Statement[] = [];
  // Comments, YAML, entities, inline metadata and multiline accessibility text can contain separators.
  const chunks =
    /^(?:---[^\n]*\n[\s\S]*?^---[^\n]*$)|%%\{[\s\S]*?\}%%|%%[^\n]*|#[^\n]*|(?:accDescr\s*\{[^}]*\}|@\{[^}]*\}|#[\w]+;|[^;\n#%]|%(?!%))+/gim;
  let previous = 0;
  let line = 1;
  for (const m of source.matchAll(chunks)) {
    const text = m[0].trim();
    if (!text || /^(?:---|%%|#)/.test(text) || /^sequenceDiagram$/i.test(text)) continue;
    const start = m.index + m[0].indexOf(text);
    line += source.slice(previous, start).split('\n').length - 1;
    previous = start;
    const [kind, values] = classify(text);
    const parent = stack.at(-1);
    const row: Statement = {
      start,
      end: start + text.length,
      line,
      kind,
      values,
      text,
      depth: stack.length,
      parent,
    };
    if (kind === 'end' && parent) {
      parent.close = row;
      row.depth--;
      stack.pop();
    } else if (blocks.includes(kind)) stack.push(row);
    rows.push(row);
  }
  return rows;
}

export function format(kind: string, v: string[]) {
  switch (kind) {
    case 'participant':
      return `${v[4] ? 'create ' : ''}${v[2] || 'participant'} ${v[0]}${v[3] ? '@{' + v[3] + '}' : ''}${v[1] ? ' as ' + v[1] : ''}`;
    case 'message':
      return `${v[0]}${v[4] || ''}${v[2]}${v[5] || ''}${v[1]}: ${v[3]}`;
    case 'note':
      return `Note ${v[0]} ${v[1]}: ${v[2]}`;
    case 'link':
    case 'links':
    case 'properties':
    case 'details':
      return `${kind} ${v[0]}: ${v[1]}`;
    case 'acctitle':
      return 'accTitle: ' + v[0];
    case 'accdescr':
      return v[0].includes('\n') ? 'accDescr {\n' + v[0] + '\n}' : 'accDescr: ' + v[0];
    default:
      return (kind + ' ' + (v[0] ?? '')).trimEnd();
  }
}

const names: Record<string, string> = {
  par_over: 'Overlapping parallel',
  rect: 'Highlight region',
  opt: 'Optional',
  alt: 'Alternative',
  par: 'Parallel',
  acctitle: 'Accessible title',
  accdescr: 'Accessible description',
  autonumber: 'Message numbering',
};
export const nameOf = (kind: string) => names[kind] ?? kind[0].toUpperCase() + kind.slice(1);

/** What each element means in a diagram, in plain words. */
export const descriptions: Record<string, string> = {
  participant: 'A person or system that sends and receives messages.',
  message: 'One step: a call, reply or event between two participants.',
  note: 'A comment beside or across lanes. It is not a step.',
  box: 'Groups participants that belong together, such as one service.',
  loop: 'Repeats the wrapped messages while a condition holds.',
  opt: 'Runs the wrapped messages only if a condition is true.',
  alt: 'Chooses one of several paths, like if / else.',
  par: 'Runs branches at the same time.',
  par_over: 'Parallel branches that may share participants and overlap.',
  critical: 'Must complete as a unit. Options list what happens on failure.',
  break: 'Stops the sequence here when its condition holds.',
  rect: 'Shades messages to draw attention. Adds no meaning.',
  activate: 'Starts a bar showing the participant is busy handling work.',
  deactivate: 'Ends the participant’s activation bar.',
  destroy: 'Ends the participant’s lifeline with a cross.',
  autonumber: 'Numbers every message so steps can be referenced.',
  link: 'Adds a link to the participant’s click menu.',
  links: 'Adds several links to the participant’s click menu.',
  properties: 'Stores extra data on a participant for other tools.',
  details: 'Points the participant at a details element in the host page.',
  title: 'A heading drawn above the diagram.',
  acctitle: 'A title for screen readers. Not drawn.',
  accdescr: 'A description for screen readers. Not drawn.',
};

const halfName = (token: string) => {
  const reverse = token.startsWith('/') || token.startsWith('\\');
  const filled = token.includes('|');
  const top = /^-+\|?\\|^-+\\\\|^\/\|?-|^\/\/-/.test(token);
  return (
    (filled ? 'Half arrowhead' : 'Half line arrowhead') +
    (top ? ', upper' : ', lower') +
    (reverse ? ', pointing back' : '') +
    (token.includes('--') ? ', dashed' : '')
  );
};
/** Human names for Mermaid arrow tokens, grouped for a picker. */
export const arrowGroups: { label: string; arrows: [string, string][] }[] = [
  {
    label: 'Common',
    arrows: [
      ['->>', 'Request · solid arrow'],
      ['-->>', 'Reply · dashed arrow'],
      ['-)', 'Async · solid open arrow'],
      ['--)', 'Async reply · dashed open arrow'],
      ['-x', 'Failed · solid with cross'],
      ['--x', 'Failed reply · dashed with cross'],
    ],
  },
  {
    label: 'Lines',
    arrows: [
      ['->', 'Solid line, no arrowhead'],
      ['-->', 'Dashed line, no arrowhead'],
      ['<<->>', 'Both ways · solid'],
      ['<<-->>', 'Both ways · dashed'],
    ],
  },
  {
    label: 'Half arrowheads',
    arrows: arrows.filter((a) => /[|/\\]/.test(a)).map((a) => [a, halfName(a)] as [string, string]),
  },
];
export const arrowName = (token: string) =>
  arrowGroups.flatMap((g) => g.arrows).find(([a]) => a === token)?.[1] ?? token;

/** Blocks whose only content is their closing `end` cannot be drawn by Mermaid. */
export const emptyBlocks = (rows: Statement[]) =>
  rows.filter(
    (row) =>
      row.close &&
      row.kind !== 'box' &&
      !rows.some((child) => child.parent === row && !['end', 'else', 'and', 'option'].includes(child.kind)),
  );
export const kinds = [
  'participant',
  'message',
  'note',
  ...blocks,
  'activate',
  'deactivate',
  'destroy',
  'autonumber',
  'link',
  'links',
  'properties',
  'details',
  'title',
  'acctitle',
  'accdescr',
];

export function referencedActors(row: Statement): string[] {
  if (row.kind === 'message') return row.values.slice(0, 2);
  if (row.kind === 'note') return row.values[1].split(',').map((id) => id.trim());
  if (
    ['participant', 'activate', 'deactivate', 'destroy', 'link', 'links', 'properties', 'details'].includes(
      row.kind,
    )
  )
    return [row.values[0]];
  return [];
}

const reserved =
  /^(?:participant|actor|create|destroy|box|loop|alt|else|opt|par|par_over|and|critical|option|break|rect|end|note|activate|deactivate|autonumber|title|links?|properties|details)(?=\s|$)/i;

/**
 * Mermaid reads a name that starts with a keyword and a space, such as `Participant 2`,
 * as that keyword. Rename such participants to `Participant_2` and keep the typed name as the label.
 */
export function safeNames(source: string, at?: number) {
  let rows = statements(source);
  const index = at === undefined ? -1 : rows.findIndex((row) => row.start >= at);
  for (const id of participants(rows)) {
    if (!reserved.test(id.trim())) continue;
    const ids = participants(rows);
    let next = id.trim().replace(/\s+/g, '_');
    if (reserved.test(next)) next += '_';
    while (ids.includes(next)) next += '_';
    const declared = rows.find((row) => row.kind === 'participant' && row.values[0] === id);
    const values = declared ? [...declared.values] : [];
    if (declared) {
      values[0] = next;
      values[1] ||= id.trim();
    }
    source = renameReferences(rows, id, next, source, declared ?? ({} as Statement), format('participant', values));
    rows = statements(source);
  }
  return { source, at: index < 0 ? at : rows[index]?.start };
}

export function participants(rows: Statement[]) {
  return [...new Set(rows.flatMap(referencedActors))];
}

/** Give moves that cross a participant's lifetime an actionable diagnostic. */
export function lifetimeIssue(rows: Statement[]) {
  const createdLater = new Set(
    rows.filter((row) => row.kind === 'participant' && row.values[4]).map((row) => row.values[0]),
  );
  const destroyed = new Set<string>();
  let finalMessageFor: string | undefined;
  for (const row of rows) {
    if (row.kind === 'participant' && row.values[4]) createdLater.delete(row.values[0]);
    if (row.kind === 'destroy') finalMessageFor = row.values[0];
    if (row.kind !== 'message') continue;
    for (const id of referencedActors(row)) {
      if (createdLater.has(id)) return `Move the message after the creation of ${id}.`;
      if (destroyed.has(id)) return `Move the message before the destruction of ${id}.`;
    }
    if (finalMessageFor) {
      destroyed.add(finalMessageFor);
      finalMessageFor = undefined;
    }
  }
}
export async function validateSequence(source: string) {
  if (!isSequence(source)) throw new Error('Start the diagram with sequenceDiagram.');
  const { default: mermaid } = await import('mermaid');
  await mermaid.parse(source);
}

export function renameReferences(
  rows: Statement[],
  id: string,
  next: string,
  source: string,
  edit: Statement,
  replacement: string,
) {
  for (const row of rows.toReversed()) {
    const values = [...row.values];
    let result = replacement;
    if (row !== edit) {
      const indices =
        row.kind === 'message'
          ? [0, 1]
          : [
                'participant',
                'activate',
                'deactivate',
                'destroy',
                'link',
                'links',
                'properties',
                'details',
              ].includes(row.kind)
            ? [0]
            : [];
      for (const i of indices) if (values[i] === id) values[i] = next;
      if (row.kind === 'note')
        values[1] = values[1]
          .split(',')
          .map((v) => (v.trim() === id ? next : v))
          .join(',');
      if (values.every((v, i) => v === row.values[i])) continue;
      result = format(row.kind, values);
    }
    source = source.slice(0, row.start) + result + source.slice(row.end);
  }
  return source;
}

export const spatial = (kind: string) => ['participant', 'message', 'note', 'activate', 'deactivate', 'destroy', ...blocks].includes(kind);

/** How to place an element once it is chosen from the palette. */
export const placementInstruction = (kind: string) =>
  kind === 'participant'
    ? 'Click the canvas where the lane should go, or drag it there.'
    : kind === 'message'
      ? 'Click the sender, then the receiver.'
      : kind === 'box'
        ? 'Click a participant to box it. Select several first to group them.'
        : blocks.includes(kind)
          ? 'Wraps selected messages. Otherwise click between messages.'
          : spatial(kind)
            ? 'Click a lane at the point in time, or drag it there.'
            : 'Opens its settings with a live preview.';
