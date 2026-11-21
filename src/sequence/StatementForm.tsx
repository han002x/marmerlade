import { useEffect, useEffectEvent, useState } from 'react';
import { arrows, nameOf, format, type Statement } from './model';

const fields: Record<string, string[]> = {
  participant: ['Identifier', 'Alias', 'Declaration', 'Metadata', 'Lifetime'],
  message: ['Sender', 'Receiver', 'Arrow', 'Message', 'Sender connection', 'Arrow modifier'],
  note: ['Placement', 'Participants', 'Note'],
  activate: ['Participant'],
  deactivate: ['Participant'],
  destroy: ['Participant'],
  box: ['Color and label'],
  rect: ['Background color'],
  autonumber: ['Start and increment, or off'],
  link: ['Participant', 'Label @ URL'],
  links: ['Participant', 'Links (JSON)'],
  properties: ['Participant', 'Properties (JSON)'],
  details: ['Participant', 'Details element ID'],
  title: ['Title'],
  acctitle: ['Accessible title'],
  accdescr: ['Accessible description'],
};
const options: Record<string, string[]> = {
  Declaration: ['participant', 'actor'],
  Lifetime: ['', 'create'],
  Arrow: arrows,
  Placement: ['over', 'left of', 'right of'],
  'Sender connection': ['', '()'],
  'Arrow modifier': ['', '+', '-', '()'],
};
const modifierNames: Record<string, string> = {
  '+': 'Activate receiver (+)',
  '-': 'Deactivate sender (−)',
  '()': 'Central connection ()',
};
const guidance: Record<string, string> = {
  message: 'Choose the same participant at both ends for a self-message.',
  box: 'Insert this box, then select it to add participant declarations inside.',
  alt: 'Select the new alternative to add an else branch.',
  par: 'Select the parallel block to add another branch with and.',
  par_over: 'Select the overlapping parallel block to add another branch with and.',
  critical: 'Select the critical block to add an option for a failure condition.',
  note: 'Use one participant, or choose Over and enter two identifiers separated by a comma.',
  deactivate: 'Choose a participant with an open activation at this point.',
  details: 'Mermaid reads details from a JSON element with this ID in the host document.',
};
function defaults(kind: string, ids: string[]) {
  const first = ids[0] || 'A',
    next = ids[1] || first;
  if (kind === 'participant') {
    let i = 1;
    while (ids.includes('P' + i)) i++;
    return ['P' + i, '', 'participant', '', ''];
  }
  if (kind === 'message') return [first, next, '->>', '', '', ''];
  if (kind === 'note') return ['over', first, ''];
  if (kind === 'rect') return ['rgb(235, 241, 250)'];
  if (['activate', 'deactivate', 'destroy', 'link', 'links', 'properties', 'details'].includes(kind))
    return [first, ['links', 'properties'].includes(kind) ? '{}' : ''];
  return [''];
}

function Numbering({ value, change }: { value: string; change: (value: string) => void }) {
  const [start, step] = value.toLowerCase() === 'off' ? [] : value.trim().split(/\s+/);
  return (
    <>
      <label>
        Numbering
        <select
          value={value.toLowerCase() === 'off' ? 'off' : 'on'}
          onChange={(e) => change(e.target.value === 'on' ? '' : 'off')}
        >
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
      </label>
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

export function StatementForm({
  kind,
  row,
  ids,
  save,
  cancel,
  busy,
  inserting = false,
  onDraft,
}: {
  kind: string;
  row?: Statement;
  ids: string[];
  busy: boolean;
  inserting?: boolean;
  onDraft?: (text: string) => void;
  save: (statement: string) => void;
  cancel: () => void;
}) {
  const [values, setValues] = useState(row?.values ?? defaults(kind, ids));
  const [partner, setPartner] = useState(ids[0] ?? 'A');
  const change = (i: number, value: string) =>
    setValues((old) => {
      const copy = [...old];
      copy[i] = value;
      return copy;
    });
  const statement = format(kind, values);
  const lifecycle =
    (!row || inserting) && (kind === 'destroy' || (kind === 'participant' && values[4] === 'create'));
  const preview =
    statement +
    (lifecycle ? '\n' + partner + '->>' + values[0] + ': ' + (kind === 'destroy' ? 'Close' : 'Create') : '');
  const reportDraft = useEffectEvent((text: string) => onDraft?.(text));
  useEffect(() => {
    reportDraft(preview);
  }, [preview]);
  return (
    <form
      className="sq-form"
      onSubmit={(e) => {
        e.preventDefault();
        save(preview);
      }}
    >
      <h3>
        {row && !inserting ? 'Edit' : 'Add'} {nameOf(kind).toLowerCase()}
      </h3>
      {guidance[kind] && <p>{guidance[kind]}</p>}
      <datalist id="sq-participants">
        {ids.map((id) => (
          <option key={id}>{id}</option>
        ))}
      </datalist>
      {kind === 'autonumber' && <Numbering value={values[0]} change={(value) => change(0, value)} />}
      {(kind === 'links' || kind === 'properties') && (
        <PropertyFields initial={values[1]} links={kind === 'links'} change={(value) => change(1, value)} />
      )}
      {kind === 'link' && (
        <>
          <label>
            Link label
            <input
              value={(values[1] ?? '').split(' @ ')[0]}
              required
              onChange={(e) =>
                change(1, e.target.value + ' @ ' + (values[1] ?? '').split(' @ ').slice(1).join(' @ '))
              }
            />
          </label>
          <label>
            URL
            <input
              value={(values[1] ?? '').split(' @ ').slice(1).join(' @ ')}
              required
              onChange={(e) => change(1, (values[1] ?? '').split(' @ ')[0] + ' @ ' + e.target.value)}
            />
          </label>
        </>
      )}
      {(fields[kind] ?? ['Label']).map((label, i) =>
        kind === 'autonumber' || (['link', 'links', 'properties'].includes(kind) && i === 1) ? null : (
          <label key={label}>
            {label}
            {options[label] ? (
              <select value={values[i] ?? ''} onChange={(e) => change(i, e.target.value)}>
                {options[label].map((value) => (
                  <option value={value} key={value}>
                    {modifierNames[value] || value || 'Default'}
                  </option>
                ))}
              </select>
            ) : kind === 'accdescr' ? (
              <textarea value={values[i]} onChange={(e) => change(i, e.target.value)} />
            ) : (
              <input
                value={values[i] ?? ''}
                list={
                  ['Sender', 'Receiver', 'Participant', 'Participants'].includes(label)
                    ? 'sq-participants'
                    : undefined
                }
                required={['Sender', 'Receiver', 'Identifier', 'Participant', 'Participants'].includes(label)}
                onChange={(e) => change(i, e.target.value)}
              />
            )}
          </label>
        ),
      )}
      {kind === 'participant' && (
        <label>
          Participant symbol
          <select
            value={/["']?type["']?\s*:\s*["']?(\w+)/i.exec(values[3] ?? '')?.[1] ?? ''}
            onChange={(e) => {
              const rest = (values[3] ?? '')
                .replace(/(?:^|,)\s*["']?type["']?\s*:\s*["']?\w+["']?\s*(?=,|$)/i, '')
                .replace(/^\s*,/, '')
                .trim();
              change(
                3,
                [rest, e.target.value && '"type": "' + e.target.value + '"'].filter(Boolean).join(', '),
              );
            }}
          >
            {[
              '',
              'actor',
              'participant',
              'boundary',
              'control',
              'entity',
              'database',
              'collections',
              'queue',
            ].map((type) => (
              <option key={type} value={type}>
                {type || 'Declaration default'}
              </option>
            ))}
          </select>
        </label>
      )}
      {(kind === 'message' || kind === 'note') && (
        <label>
          Text wrapping
          <select
            value={/^(wrap|nowrap):/i.exec(values[kind === 'message' ? 3 : 2])?.[1]?.toLowerCase() ?? ''}
            onChange={(e) => {
              const i = kind === 'message' ? 3 : 2;
              change(
                i,
                (e.target.value && e.target.value + ':') + values[i].replace(/^(?:wrap|nowrap):/i, ''),
              );
            }}
          >
            <option value="">Diagram default</option>
            <option value="wrap">Wrap</option>
            <option value="nowrap">Keep on one line</option>
          </select>
        </label>
      )}
      {lifecycle && (
        <label>
          Sender of lifecycle message
          <input
            required
            list="sq-participants"
            value={partner}
            onChange={(e) => setPartner(e.target.value)}
          />
        </label>
      )}
      <pre aria-label="Statement preview">{preview}</pre>
      <div>
        <button disabled={busy} type="submit">
          {row && !inserting ? 'Apply edit' : 'Insert'}
        </button>
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
