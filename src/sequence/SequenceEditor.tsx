import { createPortal } from 'react-dom';
import type { EditorSlots, SequenceTarget } from '../diagrams/editorSlots';
import { useDock } from '../dock';
import { parseMermaid } from '../mermaid/io';
import { ReactFlowProvider } from '@xyflow/react';
import { ToolButton } from '../components/ToolButton';
import { Icon } from '../components/Icon';
import { ParticipantTool } from './ParticipantTool';
import SequenceCanvas, { type ParticipantDrop, type Tool } from './SequenceCanvas';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useDiagram } from '../store';
import { activeAppearance, useAppearance } from '../theme';
import { diagramSvg } from '../mermaid/svg';
import { exportFile } from '../persist';
import { exportImage } from '../gif';
import {
  blocks,
  branches,
  kinds,
  nameOf,
  renameReferences,
  header,
  isSequence,
  participants,
  referencedActors,
  lifetimeIssue,
  statements,
  validateSequence,
  type Statement,
} from './model';
import { StatementForm } from './StatementForm';
import { summary } from './selection';
import './sequence.css';

type Action = { kind: string; edit?: Statement; at?: number; implicitId?: string };
const flowHeader = /^\s*(?:%%[^\n]*\n\s*)*(flowchart|graph)\b/i;

export interface SequenceSlots extends EditorSlots {
  source: HTMLDivElement | null;
  outline: HTMLDivElement | null;
  target?: SequenceTarget;
}
export default function SequenceEditor({ slots }: { slots?: SequenceSlots }) {
  const source = useDiagram((s) => s.sequence) ?? header;
  const history = useDiagram((s) => s.sequenceHistory);
  const appearance = activeAppearance(useAppearance());
  const rows = useMemo(() => statements(source), [source]);
  const ids = useMemo(() => participants(rows), [rows]);
  const [index, select] = useState(-1);
  const selected = rows[index];
  const [action, setAction] = useState<Action>();
  const [kind, setKind] = useState('message');
  const [draft, setDraft] = useState(() => slots?.drafts.get(slots.diagramId) ?? source);
  const view = useDock((state) => state.view);
  const tab = view === 'mermaid' ? 'source' : 'outline';
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState({ source: '', svg: '' });
  const { svg } = drawing;
  const dropParticipant = useRef<ParticipantDrop>(null);
  const [tool, setTool] = useState<Tool>('select');
  const panel = useDock((state) => state.open);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
    };
  }, [menu]);
  const [renderError, setRenderError] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const revision = useRef(0);
  const base = useRef(source);
  const cancel = () => {
    revision.current++;
    setBusy(false);
  };
  useEffect(() => {
    setBusy(false);
    return () => {
      revision.current++;
    };
  }, []);
  useEffect(() => {
    if (base.current !== source) {
      cancel();
      setDraft(source);
      setAction(undefined);
      select(-1);
      setError('');
      base.current = source;
    }
  }, [source]);
  useEffect(() => {
    const render = new AbortController();
    if (!rows.length) {
      setDrawing({ source, svg: '' });
      setRenderError('');
      return;
    }
    void diagramSvg(source, appearance).then(
      (value) => {
        if (!render.signal.aborted) {
          if (value) setDrawing({ source, svg: value });
          setRenderError(value ? '' : 'Mermaid could not draw this sequence. Check the source.');
        }
      },
      (e) => {
        if (!render.signal.aborted) setRenderError(String(e));
      },
    );
    return () => render.abort();
  }, [source, appearance, rows]);
  const undo = () => {
    cancel();
    useDiagram.getState().undoSequence();
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'z' &&
        !(event.target instanceof HTMLElement && event.target.closest('textarea,input,select'))
      ) {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  async function commit(value: string, at?: number) {
    const current = () => !slots || useDiagram.getState().activeDiagramId === slots.diagramId;
    if (!current()) return false;
    const ticket = ++revision.current;
    const initial = useDiagram.getState().sequenceHistory;
    setBusy(true);
    try {
      if (flowHeader.test(value)) {
        const store = useDiagram.getState();
        if (slots || store.diagrams) {
          const parsed = parseMermaid(value);
          if (!parsed.ok) throw new Error(parsed.error);
          if (slots) slots.drafts.delete(slots.diagramId);
          store.createDiagram({ kind: 'flowchart', nodes: parsed.diagram.nodes, edges: parsed.diagram.edges });
        } else {
          const res = store.syncMermaid(value);
          if (!res.ok) throw new Error(res.error);
        }
        setDraft(source);
        setError('');
        if (!slots) location.hash = '/diagrams';
        return true;
      }
      if (!isSequence(value)) throw new Error('Start with sequenceDiagram, flowchart, or graph.');
      if (statements(value).length) await diagramSvg(value, appearance);
      else await validateSequence(value);
      if (!current() || ticket !== revision.current || initial !== useDiagram.getState().sequenceHistory)
        return false;
      if (slots) slots.drafts.delete(slots.diagramId);
      base.current = value;
      useDiagram.getState().setSequence(value);
      setDraft(value);
      setError('');
      setAction(undefined);
      if (at !== undefined) select(statements(value).findIndex((r) => r.start >= at));
      return true;
    } catch (e) {
      if (ticket === revision.current) setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      if (ticket === revision.current) setBusy(false);
    }
  }

  const syncDraft = useEffectEvent((value: string) => {
    void commit(value);
  });
  useEffect(() => {
    if (source === draft) return;
    const timer = setTimeout(() => syncDraft(draft), 350);
    return () => clearTimeout(timer);
  }, [source, draft]);

  const implicit = ids.filter((id) => !rows.some((row) => row.kind === 'participant' && row.values[0] === id));
  function editImplicit(id: string) {
    const first = rows.find((row) => referencedActors(row).includes(id));
    if (!first) return;
    select(rows.indexOf(first));
    useDock.getState().setView('tree');
    setAction({
      kind: 'participant',
      implicitId: id,
      edit: { ...first, kind: 'participant', values: [id, '', 'participant', '', ''] },
    });
  }

  function save(text: string) {
    if (!action) return;
    const inserted = statements(header + '\n' + text)[0];
    if (
      !action.edit &&
      inserted?.kind === 'participant' &&
      rows.some((row) => row.kind === 'participant' && row.values[0] === inserted.values[0])
    ) {
      setError('Choose a unique participant identifier, or edit the existing participant in the outline.');
      return;
    }
    if (action.implicitId && action.edit && inserted) {
      const id = action.implicitId;
      const nextId = inserted.values[0];
      if (nextId !== id && ids.includes(nextId)) {
        setError('This participant identifier is already in use.');
        return;
      }
      const first = rows.find((row) => row.start === action.edit?.start)!;
      const preceding = participants(rows.slice(0, rows.indexOf(first)));
      const sender = referencedActors(first)[0];
      // Explicitly declare an implicit sender first to retain the original lane order.
      const prefix = sender !== id && !preceding.includes(sender) ? 'participant ' + sender + '\n  ' : '';
      const renamed = nextId === id ? source : renameReferences(rows, id, nextId, source, action.edit, text);
      const at = first.start;
      void commit(renamed.slice(0, at) + prefix + text + '\n  ' + renamed.slice(at), at + prefix.length);
      return;
    }
    if (action.edit) {
      const row = action.edit;
      const id = row.kind === 'participant' && inserted?.values[0];
      if (id && id !== row.values[0]) {
        if (ids.includes(id)) {
          setError('This participant identifier is already in use.');
          return;
        }
        void commit(renameReferences(rows, row.values[0], id, source, row, text), row.start);
      } else void commit(source.slice(0, row.start) + text + source.slice(row.end), row.start);
    } else {
      const at = action.at ?? source.length;
      const following = rows.find((r) => r.start === at);
      const branch = Object.values(branches).includes(action.kind);
      const depth = following?.kind === 'end' ? following.depth + (branch ? 0 : 1) : (selected?.depth ?? 0);
      const indent = '  '.repeat(depth + 1);
      const body =
        indent +
        text.replaceAll('\n', '\n' + indent) +
        (blocks.includes(action.kind) ? '\n' + indent + 'end' : '');
      const lineStart = source.lastIndexOf('\n', at - 1) + 1;
      // Keep closing statements and trailing comments on their original lines.
      let cut = at;
      if (following && /^\s*$/.test(source.slice(lineStart, at))) cut = lineStart;
      else if (!following) cut += /^[ \t]*(?:(?:%%|#)[^\n]*)?\r?\n/.exec(source.slice(at))?.[0].length ?? 0;
      const before = source.slice(0, cut);
      const after = source.slice(cut);
      const next =
        before +
        (before.endsWith('\n') ? '' : '\n') +
        body +
        (after || source.endsWith('\n') ? '\n' : '') +
        after;
      void commit(next, cut);
    }
  }
  function move(direction: number) {
    if (!selected) return;
    const end = selected.close?.end ?? selected.end;
    const startIndex = direction > 0 ? (selected.close ? rows.indexOf(selected.close) : index) + 1 : index - 1;
    let other = rows[startIndex];
    if (direction < 0 && other?.kind === 'end' && other.parent) other = other.parent;
    if (!other || other.parent !== selected.parent || ['end', 'else', 'and', 'option'].includes(other.kind)) {
      setError('Choose a neighbouring statement in the same branch.');
      return;
    }
    const [first, last] = direction < 0 ? [other, selected] : [selected, other];
    const fromEnd = first.close?.end ?? first.end,
      toEnd = last.close?.end ?? last.end;
    const middle = source.slice(fromEnd, last.start);
    const next =
      source.slice(0, first.start) +
      source.slice(last.start, toEnd) +
      middle +
      source.slice(first.start, fromEnd) +
      source.slice(toEnd);
    const issue = lifetimeIssue(statements(next));
    if (issue) {
      setError(issue);
      return;
    }
    void commit(next, direction < 0 ? first.start : toEnd - (end - selected.start));
  }
  function pick(i: number) {
    select(i);
    setAction(undefined);
    const row = rows[i];
    if (row && textarea.current && draft === source) textarea.current.setSelectionRange(row.start, row.end);
  }
  const errorLine = Number(/line (\d+)/i.exec(error)?.[1]);
  const visibleRows = rows.filter((row) => row.kind !== 'end');
  const clean = draft === source && !busy;
  const insertion = selected?.close?.start ?? (selected?.kind === 'end' ? selected.start : selected?.end);
  const isBranch = selected && ['else', 'and', 'option'].includes(selected.kind);
  const native = window.__marmerladeRender;
  const openSource = () => {
    useDock.setState({ open: true, view: 'mermaid' });
    setTool('select');
    requestAnimationFrame(() => textarea.current?.focus());
  };
  const toggleSource = () => useDock.getState().setOpen(!useDock.getState().open);
  const pickTarget = useEffectEvent((target: SequenceTarget) => {
    if (target.kind === 'participant') {
      const row = rows.findIndex((r) => r.kind === 'participant' && r.values[0] === target.id);
      if (row < 0 && implicit.includes(target.id)) editImplicit(target.id);
      else if (row >= 0) {
        pick(row);
        if (clean) setAction({ kind: 'participant', edit: rows[row] });
      }
      return;
    }
    const row = rows.findIndex((r) => r.start === target.start);
    if (row >= 0) {
      pick(row);
      if (clean) setAction({ kind: rows[row].kind, edit: rows[row] });
    }
  });
  const target = slots?.target;
  useEffect(() => {
    if (target) pickTarget(target);
  }, [target]);
  async function downloadImage() {
    const picture = document.createElement('div');
    picture.className = 'sq-export';
    picture.innerHTML = svg;
    const view = picture.querySelector('svg')?.viewBox.baseVal;
    if (!view) return;
    picture.style.width = view.width + 'px';
    picture.style.height = view.height + 'px';
    const staging = document.createElement('div');
    staging.className = 'sq-export-stage';
    staging.appendChild(picture);
    document.body.appendChild(staging);
    try {
      await exportImage(picture, 1200);
    } catch (e) {
      setError(String(e));
    } finally {
      staging.remove();
    }
  }
  const status = (showSource: boolean) => (
    <>
      {(error || renderError) && (
        <div className="mf-err" role="alert">
          <pre>{error || renderError}</pre>
          {showSource && errorLine > 0 && (
            <button
              onClick={() => {
                const lines = draft.split('\n');
                const line = Math.min(errorLine, lines.length) - 1;
                const start = lines.slice(0, line).reduce((sum, text) => sum + text.length + 1, 0);
                textarea.current?.focus();
                textarea.current?.setSelectionRange(start, start + lines[line].length);
              }}
            >
              Go to line {errorLine}
            </button>
          )}
        </div>
      )}
      {busy && <small role="status">Checking sequence…</small>}
    </>
  );
  const toolbar = (
    <>
      <div className="mf-group-btns">
        <ToolButton label="Select" hotkey="V" active={tool === 'select'} onClick={() => setTool('select')}>
          <Icon name="cursor" />
        </ToolButton>
        <ParticipantTool
          active={tool === 'participant'}
          disabled={!clean}
          onDrop={(point) => dropParticipant.current?.(point)}
          onClick={() => setTool(tool === 'participant' ? 'select' : 'participant')}
        />
        <ToolButton
          label="Connect participants"
          active={tool === 'message'}
          disabled={!clean || !ids.length}
          onClick={() => setTool(tool === 'message' ? 'select' : 'message')}
        >
          <Icon name="arrow" />
        </ToolButton>
      </div>
      <ToolButton label="Undo" disabled={!history.length} onClick={undo}>
        <span aria-hidden="true">↶</span>
      </ToolButton>
      <span className="mf-sep" />
      <div ref={menuRef} className="mf-menu-wrap">
        <ToolButton label="Export" expanded={menu} onClick={() => setMenu((value) => !value)}>
          <Icon name="export" />
        </ToolButton>
        {menu && (
          <div
            className="mf-menu mf-export-menu"
            role="group"
            aria-label="Export"
            onClick={() => setMenu(false)}
          >
            <button className="mf-menu-item" onClick={exportFile}>
              <Icon name="export" />
              <span>
                Workspace file <small>JSON</small>
              </span>
            </button>
            <button
              className="mf-menu-item"
              disabled={!svg || !!renderError}
              onClick={() => void downloadImage()}
            >
              <Icon name="export" />
              Export PNG
            </button>
          </div>
        )}
      </div>
    </>
  );
  const sourceContent = (
    <>
      <div className="mf-mermaid-wrap">
        <textarea
          className="mf-mermaid-text"
          ref={textarea}
          onBlur={() => {
            if (draft !== source) void commit(draft);
          }}
          aria-label="Mermaid source"
          spellCheck={false}
          value={draft}
          aria-invalid={!!error}
          onSelect={(event) => {
            if (draft === source) {
              const at = event.currentTarget.selectionStart;
              select(rows.findIndex((r) => at >= r.start && at <= r.end));
            }
          }}
          onChange={(e) => {
            const value = e.target.value;
            cancel();
            if (slots) slots.drafts.set(slots.diagramId, value);
            setDraft(value);
            setAction(undefined);
            setError('');
            setRenderError('');
          }}
        />
      </div>
      <div className="mf-panel-actions">
        <button onClick={() => void navigator.clipboard.writeText(draft).catch((e) => setError(String(e)))}>
          Copy Mermaid
        </button>
        {draft !== source && (
          <button
            onClick={() => {
              cancel();
              if (slots) slots.drafts.delete(slots.diagramId);
              setDraft(source);
              setError('');
            }}
          >
            Restore last valid source
          </button>
        )}
      </div>
      {status(true)}
    </>
  );
  const outlineContent = (
    <div className="sq-panel sq-inspector">
      {implicit.length > 0 && (
        <ul className="mf-tree-list" aria-label="Implicit participants">
          {implicit.map((id) => (
            <li key={id}>
              <button
                className="mf-tree-page"
                aria-current={action?.implicitId === id}
                disabled={!clean}
                onClick={() => editImplicit(id)}
              >
                <span>Participant · {id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ol className="mf-tree-list" aria-label="Sequence statements">
        {visibleRows.map((row) => (
          <li key={row.start} style={{ paddingInlineStart: row.depth * 12 }}>
            <button
              className="mf-tree-page"
              aria-current={!action?.implicitId && row === selected}
              onClick={() => {
                pick(rows.indexOf(row));
                if (clean) setAction({ kind: row.kind, edit: row });
              }}
            >
              <span>{summary(row)}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="sq-add">
        <select aria-label="Element to insert" value={kind} onChange={(e) => setKind(e.target.value)}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {nameOf(k)}
            </option>
          ))}
        </select>
        <button
          disabled={!clean}
          onClick={() => {
            setError('');
            setAction({ kind, at: insertion });
          }}
        >
          Add
        </button>
      </div>
      {action && (
        <StatementForm
          key={[action.kind, action.edit?.start, action.at, action.implicitId].join(':')}
          kind={action.kind}
          row={action.edit}
          ids={ids}
          busy={busy}
          save={save}
          cancel={() => {
            cancel();
            setAction(undefined);
            setError('');
          }}
        />
      )}
      {selected && (
        <div className="sq-commands">
          {branches[selected.kind] && (
            <button
              disabled={!clean}
              onClick={() => setAction({ kind: branches[selected.kind], at: selected.close?.start })}
            >
              Add {branches[selected.kind]} branch
            </button>
          )}
          {!isBranch && (
            <>
              <button disabled={!clean} onClick={() => move(-1)}>
                Move up
              </button>
              <button disabled={!clean} onClick={() => move(1)}>
                Move down
              </button>
            </>
          )}
          <button
            disabled={!clean}
            onClick={() =>
              void commit(
                source.slice(0, selected.start) + source.slice(selected.close?.end ?? selected.end),
                selected.start,
              )
            }
          >
            Remove
          </button>
        </div>
      )}
      {selected && (
        <button
          onClick={() => {
            select(-1);
            setAction(undefined);
          }}
        >
          Clear selection
        </button>
      )}
      {status(false)}
    </div>
  );
  if (native)
    return (
      <main className="sq-editor">
        <section className="sq-stage">
          {rows.length ? (
            <div className="sq-image fit" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <p className="sq-empty">Empty sequence diagram</p>
          )}
        </section>
      </main>
    );
  return (
    <main className="sq-editor">
      {slots?.toolbar && createPortal(toolbar, slots.toolbar)}
      {slots?.source && createPortal(sourceContent, slots.source)}
      {slots?.outline && createPortal(outlineContent, slots.outline)}
      <div className="sq-work">
        <section className="sq-board">
          <ReactFlowProvider>
            <SequenceCanvas
              ref={dropParticipant}
              workspaceZoom={slots?.workspaceZoom}
              svg={svg}
              source={source}
              rows={rows}
              selected={selected}
              selectedActor={action?.implicitId}
              editable={clean && (drawing.source === source || !rows.length)}
              tool={tool}
              onTool={setTool}
              onError={setError}
              onCommit={commit}
              onSource={toggleSource}
              onSelect={(row, actor, inspect) => {
                pick(row ? rows.indexOf(row) : -1);
                if (inspect) {
                  useDock.setState({ open: true, view: 'tree' });
                }
                if ((inspect || (panel && tab === 'outline')) && clean) {
                  if (actor && implicit.includes(actor)) editImplicit(actor);
                  else if (row) setAction({ kind: row.kind, edit: row });
                }
              }}
            />
          </ReactFlowProvider>
          {!rows.length && tool === 'select' && (
            <div className="sq-empty sq-start">
              <h2>Sequence diagram</h2>
              <button onClick={() => setTool('participant')}>Add participant</button>
              <button onClick={openSource}>Paste Mermaid</button>
            </div>
          )}
          {!panel && (error || renderError) && (
            <div role="alert" className="sq-canvas-error">
              {error || renderError}
              <button onClick={openSource}>Open source</button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
