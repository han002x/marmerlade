import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { arrowGroups, arrowName, descriptions, nameOf, format, type Statement } from './model';
import { Choice } from './Choice';
import { newNodeId } from '../nodeId';

const participantFields = ['activate', 'deactivate', 'destroy', 'link', 'links', 'properties', 'details'];
const blockPlaceholders: Record<string, string> = {
  loop: 'e.g. Every 5 seconds',
  opt: 'e.g. Customer has a coupon',
  alt: 'e.g. Payment accepted',
  par: 'e.g. Send email',
  par_over: 'e.g. Send email',
  critical: 'e.g. Reserve stock',
  break: 'e.g. Out of stock',
  else: 'e.g. Payment declined',
  and: 'e.g. Send SMS',
  option: 'e.g. Timeout',
};
const guidance: Record<string, string> = {
  message: 'Choose the same participant at both ends for a self-message.',
  box: 'To group more participants, cancel, select them on the canvas, then place the box again.',
  alt: 'After inserting, choose Add else branch for the other path.',
  par: 'After inserting, choose Add and branch for the next parallel path.',
  par_over: 'After inserting, choose Add and branch for the next parallel path.',
  critical: 'After inserting, choose Add option branch for each failure case.',
  activate: 'A matching Deactivate is added after this participant’s last message here. Move it to shorten the bar.',
  deactivate: 'Choose a participant with an open activation at this point.',
  details: 'Mermaid reads details from a JSON element with this ID in the page that shows the diagram.',
};
const shapes: [string, string][] = [
  ['participant', 'Box'],
  ['actor', 'Actor (stick figure)'],
  ['boundary', 'Boundary'],
  ['control', 'Control'],
  ['entity', 'Entity'],
  ['database', 'Database'],
  ['collections', 'Collections'],
  ['queue', 'Queue'],
];
const typePattern = /(?:^|,)\s*["']?type["']?\s*:\s*["']?(\w+)["']?\s*(?=,|$)/i;

function defaults(kind: string, ids: string[]) {
  const first = ids[0] || 'A',
    next = ids[1] || first;
  if (kind === 'participant') return [newNodeId(ids), '', 'participant', '', ''];
  if (kind === 'message') return [first, next, '->>', '', '', ''];
  if (kind === 'note') return ['over', first, ''];
  if (kind === 'rect') return ['rgb(235, 241, 250)'];
  if (participantFields.includes(kind)) return [first, ['links', 'properties'].includes(kind) ? '{}' : ''];
  return [''];
}

/** Read a CSS colour into the #rrggbb form a colour input accepts. */
function hex(color: string) {
  const rgb = /rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i.exec(color);
  if (rgb) return '#' + rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  return '#ebf1fa';
}
const rgb = (value: string) =>
  'rgb(' + [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)).join(', ') + ')';
/** Mermaid reads a leading colour token in `box` as the background. */
function splitBox(value: string): [string, string] {
  const m = /^\s*(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}\b|transparent\b|[a-z]+\b)\s*(.*)$/i.exec(value);
  if (!m) return ['', value.trim()];
  const named = /^[a-z]+$/i.test(m[1]);
  if (named && !(typeof CSS !== 'undefined' && CSS.supports('color', m[1]))) return ['', value.trim()];
  return [m[1], m[2]];
}

function Numbering({
  value,
  change,
  preview,
}: {
  value: string;
  change: (value: string) => void;
  preview: (value: string | undefined) => void;
}) {
  const [start, step] = value.toLowerCase() === 'off' ? [] : value.trim().split(/\s+/);
  const pick = (choice: string) => (choice === 'on' ? '' : 'off');
  return (
    <>
      <Choice
        label="Numbering"
        value={value.toLowerCase() === 'off' ? 'off' : 'on'}
        groups={[{ options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }] }]}
        change={(v) => change(pick(v))}
        preview={(v) => preview(v === undefined ? undefined : pick(v))}
      />
      {value.toLowerCase() !== 'off' && (
        <>
          <label>
            Start
            <input
              type="number"
              min="0"
              step=".01"
              placeholder="1"
              value={start ?? ''}
              onChange={(e) => change([e.target.value, step].filter(Boolean).join(' '))}
            />
          </label>
          <label>
            Increment
            <input
              type="number"
              min="0"
              step=".01"
              placeholder="1"
              value={step ?? ''}
              onChange={(e) => change([start || '1', e.target.value].filter(Boolean).join(' '))}
            />
          </label>
        </>
      )}
    </>
  );
}

function PropertyFields({
  initial,
  links,
  change,
}: {
  initial: string;
  links: boolean;
  change: (value: string) => void;
}) {
  const [entries, setEntries] = useState(() => {
    try {
      return Object.entries(JSON.parse(initial || '{}') as Record<string, unknown>);
    } catch {
      return [];
    }
  });
  function update(next: [string, unknown][]) {
    setEntries(next);
    change(JSON.stringify(Object.fromEntries(next)));
  }
  return (
    <fieldset>
      <legend>{links ? 'Participant links' : 'Participant properties'}</legend>
      {entries.map(([key, value], i) => (
        <div key={i} className="sq-property">
          <label>
            {links ? 'Link label' : 'Property name'}
            <input
              required
              ref={(input) => {
                input?.setCustomValidity(
                  entries.some(([other], j) => j !== i && other === key) ? 'Each name must be unique.' : '',
                );
              }}
              value={key}
              onChange={(e) => update(entries.map((entry, j) => (i === j ? [e.target.value, value] : entry)))}
            />
          </label>
          <label>
            {links ? 'URL' : 'Value'}
            <input
              required
              value={typeof value === 'string' ? value : JSON.stringify(value)}
              onChange={(e) => update(entries.map((entry, j) => (i === j ? [key, e.target.value] : entry)))}
            />
          </label>
          <button type="button" onClick={() => update(entries.filter((_, j) => j !== i))}>
            Remove {links ? 'link' : 'property'}
          </button>
        </div>
      ))}
      <button type="button" onClick={() => update([...entries, ['', '']])}>
        Add {links ? 'link' : 'property'}
      </button>
      {new Set(entries.map(([key]) => key)).size < entries.length && (
        <p role="alert">Use a different name for each entry.</p>
      )}
    </fieldset>
  );
}

/** Pick a participant by its drawn name. Unknown values stay selectable so edits never drop them. */
function ParticipantPicker({
  label,
  value,
  ids,
  names,
  optional,
  change,
  preview,
}: {
  label: string;
  value: string;
  ids: string[];
  names: Record<string, string>;
  optional?: string;
  change: (value: string) => void;
  preview?: (value: string | undefined) => void;
}) {
  const choices = value && !ids.includes(value) ? [...ids, value] : ids;
  if (!choices.length)
    return (
      <label>
        {label}
        <input required value={value} onChange={(e) => change(e.target.value)} />
      </label>
    );
  return (
    <Choice
      label={label}
      value={value}
      required={optional === undefined}
      change={change}
      preview={preview}
      groups={[
        {
          options: [
            ...(optional !== undefined ? [{ value: '', label: optional }] : []),
            ...choices.map((id) => ({
              value: id,
              label: names[id] && names[id] !== id ? names[id] : id,
              hint: names[id] && names[id] !== id ? id : undefined,
            })),
          ],
        },
      ]}
    />
  );
}

function More({ children }: { children: ReactNode }) {
  return <div className="sq-more">{children}</div>;
}

export function StatementForm({
  kind,
  row,
  ids,
  names = {},
  save,
  cancel,
  busy,
  invalid,
  inserting = false,
  note,
  onDraft,
  onTrial,
}: {
  kind: string;
  row?: Statement;
  ids: string[];
  names?: Record<string, string>;
  busy: boolean;
  invalid?: boolean;
  inserting?: boolean;
  /** Explains a change the drawing cannot show. */
  note?: string;
  onDraft?: (text: string, changed: boolean) => void;
  /** The statement as it would read with the option under the pointer, or undefined. */
  onTrial?: (text: string | undefined) => void;
  save: (statement: string) => void;
  cancel: () => void;
}) {
  const [values, setValues] = useState(() => row?.values ?? defaults(kind, ids));
  const [partner, setPartner] = useState(ids[0] ?? 'A');
  const [queued, setQueued] = useState(false);
  const primary = useRef<HTMLInputElement>(null);
  const [trial, setTrial] = useState<{ values: string[]; partner: string }>();
  const change = (i: number, value: string) =>
    setValues((old) => {
      const copy = [...old];
      copy[i] = value;
      return copy;
    });
  const replaced = (i: number, value: string) => values.map((old, j) => (j === i ? value : old));
  /** Props for a dropdown whose options each produce a whole new set of values. */
  const options = (next: (value: string) => string[]) => ({
    change: (value: string) => setValues(next(value)),
    preview: (value: string | undefined) =>
      setTrial(value === undefined ? undefined : { values: next(value), partner }),
  });
  const compose = (vals: string[], who: string) => {
    const lifecycle =
      (!row || inserting) && (kind === 'destroy' || (kind === 'participant' && vals[4] === 'create'));
    const closer = who === vals[0] ? (ids.find((id) => id !== vals[0]) ?? who) : who;
    return (
      format(kind, vals) +
      (lifecycle ? '\n' + closer + '->>' + vals[0] + ': ' + (kind === 'destroy' ? 'Close' : 'Create') : '')
    );
  };
  const lifecycle =
    (!row || inserting) && (kind === 'destroy' || (kind === 'participant' && values[4] === 'create'));
  const closer = partner === values[0] ? (ids.find((id) => id !== values[0]) ?? partner) : partner;
  const preview = compose(values, partner);
  const initial = useRef(preview);
  const trialText = trial ? compose(trial.values, trial.partner) : undefined;
  const reportDraft = useEffectEvent((text: string) => onDraft?.(text, text !== initial.current));
  useEffect(() => {
    reportDraft(preview);
  }, [preview]);
  const reportTrial = useEffectEvent((text: string | undefined) => onTrial?.(text));
  useEffect(() => {
    reportTrial(trialText === preview ? undefined : trialText);
  }, [trialText, preview]);
  useEffect(() => () => reportTrial(undefined), []);
  useEffect(() => {
    if (!inserting || !primary.current) return;
    primary.current.focus({ preventScroll: true });
    primary.current.select();
  }, [inserting]);
  // Enter pressed while the preview is still rendering is kept and applied once it is ready.
  const flush = useEffectEvent(() => {
    setQueued(false);
    if (!invalid) save(preview);
  });
  useEffect(() => {
    if (queued && (!busy || invalid)) flush();
  }, [queued, busy, invalid]);
  const wrapping = (i: number) => (
    <Choice
      label="Text wrapping"
      value={/^(wrap|nowrap):/i.exec(values[i] ?? '')?.[1]?.toLowerCase() ?? ''}
      groups={[
        {
          options: [
            { value: '', label: 'Diagram default' },
            { value: 'wrap', label: 'Wrap' },
            { value: 'nowrap', label: 'Keep on one line' },
          ],
        },
      ]}
      {...options((v) => replaced(i, (v && v + ':') + (values[i] ?? '').replace(/^(?:wrap|nowrap):/i, '')))}
    />
  );
  const text = (label: string, i: number, props: { placeholder?: string; required?: boolean; main?: boolean } = {}) => (
    <label>
      {label}
      <input
        ref={props.main ? primary : undefined}
        data-field={label}
        value={values[i] ?? ''}
        placeholder={props.placeholder}
        required={props.required}
        onChange={(e) => change(i, e.target.value)}
      />
    </label>
  );
  const picker = (label: string, i: number) => (
    <ParticipantPicker
      label={label}
      value={values[i] ?? ''}
      ids={ids}
      names={names}
      {...options((v) => replaced(i, v))}
    />
  );

  let body: ReactNode;
  if (kind === 'participant') {
    const type = typePattern.exec(values[3] ?? '')?.[1]?.toLowerCase() ?? (values[2] || 'participant');
    body = (
      <>
        <Choice
          label="Shape"
          value={type}
          groups={[{ options: shapes.map(([value, label]) => ({ value, label })) }]}
          {...options((shape) => {
            const rest = (values[3] ?? '').replace(typePattern, '').replace(/^\s*,/, '').trim();
            const custom = !['participant', 'actor'].includes(shape);
            const copy = [...values];
            copy[2] = shape === 'actor' ? 'actor' : 'participant';
            copy[3] = [rest, custom && '"type": "' + shape + '"'].filter(Boolean).join(', ');
            return copy;
          })}
        />
        <More>
          <label className="sq-check">
            <input
              type="checkbox"
              checked={values[4] === 'create'}
              onChange={(e) => change(4, e.target.checked ? 'create' : '')}
            />
            Starts mid-diagram (drawn where a message creates it)
          </label>
          {text('Mermaid metadata', 3, { placeholder: '"type": "queue"' })}
        </More>
      </>
    );
  } else if (kind === 'message') {
    const known = arrowGroups.some((g) => g.arrows.some(([a]) => a === values[2]));
    body = (
      <>
        {picker('From', 0)}
        {picker('To', 1)}
        {text('Message', 3, { placeholder: 'e.g. Submit order', main: true })}
        <Choice
          label="Arrow"
          value={values[2]}
          groups={[
            ...(known ? [] : [{ options: [{ value: values[2], label: arrowName(values[2]), hint: values[2] }] }]),
            ...arrowGroups.map((group) => ({
              label: group.label,
              options: group.arrows.map(([token, name]) => ({ value: token, label: name, hint: token })),
            })),
          ]}
          {...options((v) => replaced(2, v))}
        />
        <More>
          <Choice
            label="Receiver activation"
            value={values[5] ?? ''}
            groups={[
              {
                options: [
                  { value: '', label: 'No change' },
                  { value: '+', label: 'Activate receiver', hint: '+' },
                  { value: '-', label: 'Deactivate sender', hint: '−' },
                  { value: '()', label: 'Central connection', hint: '()' },
                ],
              },
            ]}
            {...options((v) => replaced(5, v))}
          />
          <Choice
            label="Sender connection"
            value={values[4] ?? ''}
            groups={[
              {
                options: [
                  { value: '', label: 'Default' },
                  { value: '()', label: 'Central connection', hint: '()' },
                ],
              },
            ]}
            {...options((v) => replaced(4, v))}
          />
          {wrapping(3)}
        </More>
      </>
    );
  } else if (kind === 'note') {
    const [first = '', second = ''] = (values[1] ?? '').split(',').map((id) => id.trim());
    const people = (a: string, b: string) => replaced(1, [a, values[0] === 'over' ? b : ''].filter(Boolean).join(','));
    body = (
      <>
        <Choice
          label="Position"
          value={values[0]}
          groups={[
            {
              options: [
                { value: 'over', label: 'Over' },
                { value: 'left of', label: 'Left of' },
                { value: 'right of', label: 'Right of' },
              ],
            },
          ]}
          {...options((v) => [v, v === 'over' ? values[1] : first, ...values.slice(2)])}
        />
        <ParticipantPicker
          label="Participant"
          value={first}
          ids={ids}
          names={names}
          {...options((v) => people(v, second))}
        />
        {values[0] === 'over' && (
          <ParticipantPicker
            label="Stretch to"
            value={second}
            optional="Just this participant"
            ids={ids.filter((id) => id !== first)}
            names={names}
            {...options((v) => people(first, v))}
          />
        )}
        {text('Note', 2, { placeholder: 'e.g. Validates the cart', main: true })}
        <More>{wrapping(2)}</More>
      </>
    );
  } else if (kind === 'box') {
    const [color, label] = splitBox(values[0] ?? '');
    const set = (c: string, l: string) => change(0, [c, l].filter(Boolean).join(' '));
    body = (
      <>
        <label>
          Label
          <input
            ref={primary}
            value={label}
            placeholder="e.g. Payments service"
            onChange={(e) => set(color, e.target.value)}
          />
        </label>
        <label className="sq-check">
          <input type="checkbox" checked={!!color} onChange={(e) => set(e.target.checked ? 'rgb(235, 241, 250)' : '', label)} />
          Background colour
        </label>
        {color && (
          <input
            type="color"
            aria-label="Box colour"
            value={hex(color)}
            onChange={(e) => set(rgb(e.target.value), label)}
          />
        )}
      </>
    );
  } else if (kind === 'rect') {
    body = (
      <label>
        Highlight colour
        <span className="sq-color">
          <input type="color" aria-label="Pick colour" value={hex(values[0])} onChange={(e) => change(0, rgb(e.target.value))} />
          <input ref={primary} aria-label="Colour value" value={values[0]} onChange={(e) => change(0, e.target.value)} />
        </span>
      </label>
    );
  } else if (kind === 'autonumber') {
    body = <Numbering value={values[0]} {...options((v) => replaced(0, v))} />;
  } else if (participantFields.includes(kind)) {
    body = (
      <>
        {picker('Participant', 0)}
        {kind === 'link' && (
          <>
            <label>
              Link label
              <input
                ref={primary}
                value={(values[1] ?? '').split(' @ ')[0]}
                required
                onChange={(e) => change(1, e.target.value + ' @ ' + (values[1] ?? '').split(' @ ').slice(1).join(' @ '))}
              />
            </label>
            <label>
              URL
              <input
                value={(values[1] ?? '').split(' @ ').slice(1).join(' @ ')}
                required
                placeholder="https://"
                onChange={(e) => change(1, (values[1] ?? '').split(' @ ')[0] + ' @ ' + e.target.value)}
              />
            </label>
          </>
        )}
        {(kind === 'links' || kind === 'properties') && (
          <PropertyFields initial={values[1]} links={kind === 'links'} change={(value) => change(1, value)} />
        )}
        {kind === 'details' && text('Details element ID', 1, { main: true })}
      </>
    );
  } else if (kind === 'accdescr') {
    body = (
      <label>
        Accessible description
        <textarea value={values[0]} onChange={(e) => change(0, e.target.value)} />
      </label>
    );
  } else {
    const label = kind === 'title' ? 'Title' : kind === 'acctitle' ? 'Accessible title' : 'Label';
    body = text(label, 0, { placeholder: blockPlaceholders[kind], main: true });
  }

  return (
    <form
      className="sq-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!inserting && preview === initial.current) return cancel();
        if (invalid) return;
        if (busy) setQueued(true);
        else save(preview);
      }}
    >
      <h3>
        {row && !inserting ? 'Edit' : 'Add'} {nameOf(kind).toLowerCase()}
      </h3>
      {inserting && descriptions[kind] && <p className="sq-meaning">{descriptions[kind]}</p>}
      {guidance[kind] && <p>{guidance[kind]}</p>}
      {body}
      {lifecycle && (
        <ParticipantPicker
          label={kind === 'destroy' ? 'Closed by' : 'Created by'}
          value={closer}
          ids={ids.filter((id) => id !== values[0])}
          names={names}
          change={setPartner}
          preview={(v) => setTrial(v === undefined ? undefined : { values, partner: v })}
        />
      )}
      {note && (
        <p className="sq-note" role="note">
          {note}
        </p>
      )}
      <div>
        <button type="submit" aria-busy={queued} disabled={invalid}>
          {queued ? 'Checking…' : inserting ? 'Insert' : 'Apply edit'}
        </button>
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
