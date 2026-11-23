import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { arrowGroups, arrowName, format, type Statement } from './model';
import { Choice } from './Choice';
import { ArrowGlyph, IconChoice, type ArrowHead } from './IconChoice';
import { Icon } from '../components/Icon';
type IconProps = Parameters<typeof Icon>[0];

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
const heads: [ArrowHead, string, string][] = [
  ['arrow', '>>', 'arrow'],
  ['open', ')', 'open arrow'],
  ['cross', 'x', 'cross'],
  ['none', '>', 'no arrowhead'],
  ['both', '>>', 'arrows both ways'],
];
/** The common arrows drawn as an icon grid: a solid row, then a dashed row. */
const arrowIcons = [false, true].flatMap((dashed) =>
  heads.map(([head, end, name]) => {
    const value = (head === 'both' ? '<<' : '') + (dashed ? '--' : '-') + end;
    return { value, label: (dashed ? 'Dashed, ' : 'Solid, ') + name, icon: <ArrowGlyph dashed={dashed} head={head} /> };
  }),
);
const notePositions = [
  { value: 'left of', label: 'Left of', icon: <Icon name="note-left" size={18} /> },
  { value: 'over', label: 'Over', icon: <Icon name="note-over" size={18} /> },
  { value: 'right of', label: 'Right of', icon: <Icon name="note-right" size={18} /> },
];
const typePattern = /(?:^|,)\s*["']?type["']?\s*:\s*["']?(\w+)["']?\s*(?=,|$)/i;

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
  hideLabel,
  change,
  preview,
}: {
  label: string;
  value: string;
  ids: string[];
  names: Record<string, string>;
  optional?: string;
  hideLabel?: boolean;
  change: (value: string) => void;
  preview?: (value: string | undefined) => void;
}) {
  const choices = value && !ids.includes(value) ? [...ids, value] : ids;
  if (!choices.length)
    return (
      <label>
        <span className={hideLabel ? 'sq-sr-only' : undefined}>{label}</span>
        <input required value={value} onChange={(e) => change(e.target.value)} />
      </label>
    );
  return (
    <Choice
      label={label}
      hideLabel={hideLabel}
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

export function StatementForm({
  row,
  ids,
  names = {},
  save,
  cancel,
  actions,
  busy,
  invalid,
  onDraft,
  onTrial,
  onPick,
}: {
  row: Statement;
  ids: string[];
  names?: Record<string, string>;
  busy: boolean;
  invalid?: boolean;
  onDraft?: (text: string, changed: boolean) => void;
  /** The statement as it would read with the option under the pointer, or undefined. */
  onTrial?: (text: string | undefined) => void;
  /** A setting was picked and should apply once its preview is ready. */
  onPick?: () => void;
  save: (statement: string) => void;
  cancel: () => void;
  /** Extra buttons shown beside the element's icon toggles. */
  actions?: ReactNode;
}) {
  const { kind } = row;
  const [values, setValues] = useState(row.values);
  const [queued, setQueued] = useState(false);
  const [moreArrows, setMoreArrows] = useState(false);
  const [trial, setTrial] = useState<string[]>();
  const change = (i: number, value: string) =>
    setValues((old) => {
      const copy = [...old];
      copy[i] = value;
      return copy;
    });
  const pick = (next: string[]) => {
    setTrial(undefined);
    setValues(next);
    onPick?.();
  };
  const replaced = (i: number, value: string) => values.map((old, j) => (j === i ? value : old));
  /** Props for a dropdown whose options each produce a whole new set of values. */
  const options = (next: (value: string) => string[]) => ({
    change: (value: string) => pick(next(value)),
    preview: (value: string | undefined) =>
      setTrial(value === undefined ? undefined : next(value)),
  });
  const preview = format(kind, values);
  const [initial] = useState(preview);
  const trialText = trial ? format(kind, trial) : undefined;
  const reportDraft = useEffectEvent((text: string) => onDraft?.(text, text !== initial));
  useEffect(() => {
    reportDraft(preview);
  }, [preview]);
  const reportTrial = useEffectEvent((text: string | undefined) => onTrial?.(text));
  useEffect(() => {
    reportTrial(trialText === preview ? undefined : trialText);
  }, [trialText, preview]);
  useEffect(() => () => reportTrial(undefined), []);
  // Enter pressed while the preview is still rendering is kept and applied once it is ready.
  const flush = useEffectEvent(() => {
    setQueued(false);
    if (!invalid) save(preview);
  });
  useEffect(() => {
    if (queued && (!busy || invalid)) flush();
  }, [queued, busy, invalid]);
  /** An icon button that switches one setting, previewing the result on the canvas while pointed at. */
  const toggle = (icon: IconProps['name'], label: string, pressed: boolean, next: () => string[]) => (
    <button
      key={label}
      type="button"
      className="sq-icon-toggle"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onPointerEnter={() => setTrial(next())}
      onPointerLeave={() => setTrial(undefined)}
      onClick={() => pick(next())}
    >
      <Icon name={icon} />
    </button>
  );
  /** Toggles Mermaid's `wrap:` prefix; an existing `nowrap:` stays until the toggle is used. */
  const wrapping = (i: number) => {
    const wrapped = /^wrap:/i.test(values[i] ?? '');
    const next = () => replaced(i, (wrapped ? '' : 'wrap:') + (values[i] ?? '').replace(/^(?:wrap|nowrap):/i, ''));
    return toggle('wrap-text', 'Wrap text', wrapped, next);
  };
  const text = (label: string, i: number, placeholder?: string) => (
    <label>
      {label}
      <input
        data-field={label}
        value={values[i] ?? ''}
        placeholder={placeholder}
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
        <div className="sq-element-actions">
        <button
          type="button"
          className="sq-icon-toggle"
          aria-pressed={values[4] === 'create'}
          aria-label="Starts mid-diagram"
          title="Starts mid-diagram (drawn where a message creates it)"
          onClick={() => pick(replaced(4, values[4] === 'create' ? '' : 'create'))}
        >
          <Icon name="lifeline-start" size={22} />
        </button>
          {actions}
        </div>
      </>
    );
  } else if (kind === 'message') {
    const common = arrowIcons.some((option) => option.value === values[2]);
    // Half arrowheads and connection circles are rare, so they wait behind “More”, unless in use.
    const advanced = !common || values[4] === '()' || values[5] === '()';
    const half = arrowGroups.find((group) => group.label === 'Half arrowheads')!;
    const swapped = () => [values[1], values[0], ...values.slice(2)];
    const end = (token: string) => () => replaced(5, values[5] === token ? '' : token);
    body = (
      <>
        <div className="sq-ends">
          <ParticipantPicker label="From" hideLabel value={values[0] ?? ''} ids={ids} names={names} {...options((v) => replaced(0, v))} />
          <button
            type="button"
            className="sq-icon-toggle"
            aria-label="Swap direction"
            title="Swap direction"
            onPointerEnter={() => setTrial(swapped())}
            onPointerLeave={() => setTrial(undefined)}
            onClick={() => pick(swapped())}
          >
            <Icon name="swap" />
          </button>
          <ParticipantPicker label="To" hideLabel value={values[1] ?? ''} ids={ids} names={names} {...options((v) => replaced(1, v))} />
        </div>
        <div className="sq-arrows">
          <IconChoice label="Arrow" columns={5} value={values[2]} options={arrowIcons} {...options((v) => replaced(2, v))} />
          <button
            type="button"
            className="sq-icon-toggle"
            aria-pressed={moreArrows || advanced}
            aria-expanded={moreArrows || advanced}
            disabled={advanced}
            aria-label="More arrow options"
            title="More arrow options"
            onClick={() => setMoreArrows((open) => !open)}
          >
            <Icon name="more" />
          </button>
        </div>
        {(moreArrows || advanced) && (
          <>
          <Choice
            label="Half arrowheads"
            hideLabel
            value={common ? '' : values[2]}
            groups={[
              ...(half.arrows.some(([a]) => a === values[2]) || common
                ? []
                : [{ options: [{ value: values[2], label: arrowName(values[2]), hint: values[2] }] }]),
              { options: half.arrows.map(([token, name]) => ({ value: token, label: name, hint: token })) },
            ]}
            {...options((v) => replaced(2, v))}
          />
          <div className="sq-element-actions">
            {toggle('dot-sender', 'Circle at sender', values[4] === '()', () => replaced(4, values[4] === '()' ? '' : '()'))}
            {toggle('dot-receiver', 'Circle at receiver', values[5] === '()', end('()'))}
          </div>
          </>
        )}
        <div className="sq-element-actions">
          {toggle('activate-bar', 'Activate receiver', values[5] === '+', end('+'))}
          {toggle('deactivate-bar', 'Deactivate sender', values[5] === '-', end('-'))}
          {wrapping(3)}
          {actions}
        </div>
      </>
    );
  } else if (kind === 'note') {
    const [first = '', second = ''] = (values[1] ?? '').split(',').map((id) => id.trim());
    const people = (a: string, b: string) => replaced(1, [a, values[0] === 'over' ? b : ''].filter(Boolean).join(','));
    body = (
      <>
        <IconChoice
          label="Position"
          value={values[0]}
          options={notePositions}
          {...options((v) => [v, v === 'over' ? values[1] : first, ...values.slice(2)])}
        />
        <div className="sq-ends">
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
              optional="Just this one"
              ids={ids.filter((id) => id !== first)}
              names={names}
              {...options((v) => people(first, v))}
            />
          )}
        </div>
        <div className="sq-element-actions">
          {wrapping(2)}
          {actions}
        </div>
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
          <input aria-label="Colour value" value={values[0]} onChange={(e) => change(0, e.target.value)} />
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
        {kind === 'details' && text('Details element ID', 1)}
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
    body = text(label, 0, blockPlaceholders[kind]);
  }

  return (
    <form
      className="sq-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (preview === initial) return cancel();
        if (invalid) return;
        if (busy) setQueued(true);
        else save(preview);
      }}
    >
      {body}
      {preview !== initial && !['participant', 'message', 'note'].includes(kind) && (
        <button type="submit" aria-busy={queued} disabled={invalid}>
          Apply edit
        </button>
      )}
    </form>
  );
}
