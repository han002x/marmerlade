import { createPortal } from 'react-dom';
import type { EditorSlots, SequenceTarget } from '../diagrams/editorSlots';
import { useDock } from '../dock';
import { parseMermaid } from '../mermaid/io';
import { ReactFlowProvider } from '@xyflow/react';
import { ToolButton } from '../components/ToolButton';
import { Icon } from '../components/Icon';
import { ElementPalette } from './ElementPalette';
import { closeActivation, insertElement, sampleEdit } from './insertion';
import { moveLane, removeSelection, type CanvasEdit } from './canvasEdits';
import SequenceCanvas, { type PlacementHandle, type Tool } from './SequenceCanvas';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useDiagram } from '../store';
import { activeAppearance, useAppearance } from '../theme';
import { diagramSvg } from '../mermaid/svg';
import { exportFile } from '../persist';
import { exportImage } from '../gif';
import {
  emptyBlocks,
  spatial,
  branches,
  nameOf,
  renameReferences,
  header,
  isSequence,
  participants,
  referencedActors,
  descriptions,
  lifetimeIssue,
  safeNames,
  placementInstruction,
  statements,
  validateSequence,
  type Statement,
} from './model';
import { StatementForm } from './StatementForm';
import type { PropertyFocus } from './RailProperties';
import { bindSelection, summary } from './selection';
import { applySequenceStyles } from './applyStyles';
import { remapSequenceStyles } from './styleMap';
import './sequence.css';

type Action = {
  edit: Statement;
  implicitId?: string;
};
const flowHeader = /^\s*(?:%%[^\n]*\n\s*)*(flowchart|graph)\b/i;

export interface SequenceSlots extends EditorSlots {
  source: HTMLDivElement | null;
  outline: HTMLDivElement | null;
  target?: SequenceTarget;
}
export default function SequenceEditor({ slots }: { slots?: SequenceSlots }) {
  const [localPanel, setLocalPanel] = useState<HTMLElement | null>(null);
  const source = useDiagram((s) => s.sequence) ?? header;
  const history = useDiagram((s) => s.sequenceHistory);
  const appearance = activeAppearance(useAppearance());
  const rows = useMemo(() => statements(source), [source]);
  const ids = useMemo(() => participants(rows), [rows]);
  const [index, setIndex] = useState(-1);
  // Inserting selects the new statement for editing. Only a selection the user made may be wrapped.
  const [explicit, setExplicit] = useState(false);
  const select = (i: number, chosen = false) => {
    setIndex(i);
    setExplicit(chosen && i >= 0);
  };
  const names = useMemo(
    () =>
      Object.fromEntries(
        rows.filter((r) => r.kind === 'participant' && r.values[1]).map((r) => [r.values[0], r.values[1]]),
      ),
    [rows],
  );
  const selected = rows[index];
  const [selectedActor, setSelectedActor] = useState<string>();
  const [action, setAction] = useState<Action>();
  const [propertyFocus, setPropertyFocus] = useState<PropertyFocus>();
  const [placementKind, setPlacementKind] = useState<string>();
  const [pending, setPending] = useState<{
    base: string;
    kind: string;
    row?: Statement;
    build: (text: string) => CanvasEdit;
  }>();
  const [candidate, setCandidate] = useState<{ source: string; svg: string }>();
  const [proposal, setProposal] = useState<string>();
  const [previewError, setPreviewError] = useState('');
  const previewRevision = useRef(0);
  const [draft, setDraft] = useState(() => slots?.drafts.get(slots.diagramId) ?? source);
  const view = useDock((state) => state.view);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState({ source: '', svg: '' });
  const { svg } = drawing;
  const placement = useRef<PlacementHandle>(null);
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
      setSelectedActor(undefined);
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
    discardInsertion();
    closeProperties();
    cancel();
    useDiagram.getState().undoSequence();
  };
  const undoFromKeyboard = useEffectEvent(undo);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'z' &&
        !(event.target instanceof HTMLElement && event.target.closest('textarea,input,select'))
      ) {
        event.preventDefault();
        undoFromKeyboard();
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
          store.createDiagram({
            kind: 'flowchart',
            nodes: parsed.diagram.nodes,
            edges: parsed.diagram.edges,
          });
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
      if (at !== undefined) setSelectedActor(undefined);
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

  function discardInsertion() {
    previewRevision.current++;
    setPending(undefined);
    setCandidate(undefined);
    setProposal(undefined);
    setPreviewError('');
    setPlacementKind(undefined);
    setTool('select');
  }
  function cancelForm() {
    if (owner) {
      cancel();
      setError('');
    }
    if (pending) discardInsertion();
    else closeProperties();
  }
  useEffect(() => {
    discardInsertion();
  }, [source, slots?.diagramId]);
  const dismissCanvasEdits = useEffectEvent(() => {
    cancelForm();
    setPlacementKind(undefined);
    setTool('select');
  });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) dismissCanvasEdits();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (view === 'mermaid') dismissCanvasEdits();
  }, [view]);
  function openInsertion(value: NonNullable<typeof pending>) {
    previewRevision.current++;
    setAction(undefined);
    setCandidate(undefined);
    setProposal(undefined);
    setPreviewError('');
    setError('');
    setPending({
      ...value,
      build: (text) => {
        const edit = value.build(text);
        const safe = safeNames(edit.source, edit.at);
        return { source: safe.source, at: safe.at ?? edit.at };
      },
    });
    setPlacementKind(undefined);
    setTool('select');
  }
  function proposeEdit(edit: CanvasEdit) {
    const row = statements(edit.source).find((item) => item.start >= edit.at);
    if (!row) return;
    openInsertion({
      base: source,
      kind: row.kind,
      row,
      build: (text) => ({
        source: edit.source.slice(0, row.start) + text + edit.source.slice(row.end),
        at: row.start,
      }),
    });
  }
  function beginInsertion(
    kind: string,
    at = insertion ?? source.length,
    selection: Statement[] = [],
    actor?: string,
  ) {
    const row =
      actor && ['note', 'activate', 'deactivate', 'destroy'].includes(kind)
        ? {
            start: 0,
            end: 0,
            line: 0,
            text: '',
            kind,
            depth: 0,
            values: kind === 'note' ? ['over', actor, ''] : [actor],
          }
        : undefined;
    openInsertion({
      base: source,
      kind,
      row,
      build: (text) => {
        const edit = insertElement(source, text, kind, at, selection, actor);
        return kind === 'activate' ? closeActivation(edit) : edit;
      },
    });
  }
  const owner = pending ?? action;
  function buildDraft(text: string): CanvasEdit {
    if (pending?.base === source) {
      const edit = pending.build(text);
      if (pending.kind === 'participant') {
        const actor = statements(edit.source).find((row) => row.start >= edit.at)?.values[0];
        if (actor && ids.includes(actor)) throw new Error('This participant identifier is already in use.');
      }
      return edit;
    }
    if (action) return buildExisting(action, text);
    throw new Error('Choose an element to edit.');
  }

  const draftProperties = (text: string, changed: boolean) => {
    try {
      setProposal(pending || changed ? buildDraft(text).source : source);
      setPreviewError('');
    } catch (reason) {
      setProposal(undefined);
      setCandidate(undefined);
      setPreviewError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  useEffect(() => {
    const revision = ++previewRevision.current;
    setCandidate(undefined);
    if (!owner || proposal === undefined) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const issue = 'build' in owner && lifetimeIssue(statements(proposal));
          if (issue) throw new Error(issue);
          const svg = proposal === source ? '' : await diagramSvg(proposal, appearance);
          if (revision === previewRevision.current) {
            setCandidate({ source: proposal, svg });
            setPreviewError('');
          }
        } catch (reason) {
          if (revision === previewRevision.current)
            setPreviewError(reason instanceof Error ? reason.message : String(reason));
        }
      })();
    }, 200);
    return () => {
      clearTimeout(timer);
      previewRevision.current++;
    };
  }, [owner, proposal, appearance, source]);
  // The option under the pointer in an open dropdown, drawn in place until the pointer leaves.
  // Owned by the open form, so a trial left behind by a closed form is never drawn.
  const [trial, setTrial] = useState<{ owner: object; base: string; source: string }>();
  // A palette tile under the pointer, drawn as an example in this diagram.
  const [sample, setSample] = useState<{ kind: string; base: string; source: string; message?: number }>();
  const hasPropertyDraft = !!previewError || (proposal !== undefined && proposal !== source);
  const sampleSource = sample && sample.base === source && !pending && !hasPropertyDraft ? sample.source : undefined;
  const trialSource =
    (trial && trial.owner === owner && trial.base === source ? trial.source : undefined) ?? sampleSource;
  // The last drawn trial stays up while the next option renders, so hovering down a list does not flicker.
  const [trialDrawing, setTrialDrawing] = useState<{ source: string; svg: string }>();
  // A sample Mermaid cannot draw falls back to the palette's hover card.
  const [failedSample, setFailedSample] = useState<string>();
  useEffect(() => {
    if (trialSource === undefined) return;
    let live = true;
    const timer = setTimeout(() => {
      void diagramSvg(trialSource, appearance).then(
        (value) => live && setTrialDrawing(value ? { source: trialSource, svg: value } : undefined),
        () => {
          if (!live) return;
          setTrialDrawing(undefined);
          if (trialSource === sampleSource) {
            setFailedSample(trialSource);
            setSample(undefined);
          }
        },
      );
    }, 60);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [trialSource, sampleSource, appearance]);
  const trialSvg = trialSource === undefined ? undefined : trialDrawing?.svg;
  // A message sample is drawn dotted so it reads as a preview, not as part of the diagram.
  const sampleMessage =
    sampleSource !== undefined && trialSource === sampleSource && trialDrawing?.source === sampleSource
      ? sample?.message
      : undefined;
  const offer = (next?: string) =>
    setTrial(next === undefined || !owner ? undefined : { owner, base: source, source: next });
  const trialProperties = (text: string | undefined) => {
    if (text === undefined || !owner) return offer();
    try {
      offer(buildDraft(text).source);
    } catch {
      offer();
    }
  };
  const quiet = useMemo(() => {
    if (!pending || proposal === undefined) return undefined;
    const kind = pending.kind;
    const next = statements(proposal);
    const added = next.find(
      (row) => row.kind === kind && !rows.some((old) => old.text === row.text && old.line === row.line),
    );
    const actor = added?.values[0];
    if (kind === 'activate' && added) {
      const later = next.slice(next.indexOf(added) + 1);
      const stop = later.findIndex((row) => row.kind === 'deactivate' && row.values[0] === actor);
      const span = stop < 0 ? later : later.slice(0, stop);
      if (!span.some((row) => row.kind === 'message' && row.values.slice(0, 2).includes(actor!)))
        return 'Nothing to draw yet: the bar appears once a later message reaches ' + (names[actor!] ?? actor) + '.';
    }
    if (kind === 'autonumber' && added && !next.slice(next.indexOf(added)).some((row) => row.kind === 'message'))
      return 'Numbers appear on messages added after this point.';
    if (['link', 'links'].includes(kind))
      return 'The drawing does not change. Viewers open these links from ' + (names[actor!] ?? actor ?? 'the participant') + '’s menu in exported SVGs and embeds.';
    if (['properties', 'details'].includes(kind))
      return 'The drawing does not change. This data is stored with the participant for tools that read it.';
    if (['acctitle', 'accdescr'].includes(kind))
      return 'The drawing does not change. Screen readers announce this text.';
    return undefined;
  }, [pending, proposal, rows, names]);
  async function applyProperties(text: string) {
    if (!owner || !candidate) return;
    try {
      const edit = buildDraft(text);
      if (edit.source !== candidate.source) return;
      if (edit.source === source) closeProperties();
      else if (await commit(edit.source, edit.at)) discardInsertion();
    } catch (reason) {
      setPreviewError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const implicit = ids.filter(
    (id) => !rows.some((row) => row.kind === 'participant' && row.values[0] === id),
  );
  function closeProperties() {
    previewRevision.current++;
    setAction(undefined);
    setPropertyFocus(undefined);
    setCandidate(undefined);
    setProposal(undefined);
    setPreviewError('');
    if (action) setError('');
  }
  function openProperties(row: Statement | undefined, actor: string | undefined, focus?: PropertyFocus) {
    if (!clean || pending) return;
    if (action && (actor ? action.implicitId === actor : action.edit === row)) {
      if (focus) setPropertyFocus(focus);
      return;
    }
    closeProperties();
    setPropertyFocus(focus);
    if (actor) {
      const first = rows.find((item) => referencedActors(item).includes(actor));
      if (first) setAction({
        implicitId: actor,
        edit: { ...first, kind: 'participant', values: [actor, '', 'participant', '', ''] },
      });
    } else if (row) setAction({ edit: row });
  }

  function buildExisting({ edit, implicitId }: Action, text: string): CanvasEdit {
    const next = statements(header + '\n' + text)[0];
    if (edit.kind === 'participant' && !next?.values[0])
      throw new Error('Enter a participant name.');
    const id = edit.values[0];
    const nextId = edit.kind === 'participant' ? next.values[0] : id;
    if (nextId !== id && ids.includes(nextId))
      throw new Error('This participant identifier is already in use.');

    let at = edit.start;
    let value: string;
    if (implicitId) {
      const first = rows.find((row) => row.start === edit.start);
      if (!first) throw new Error('This participant is no longer in the diagram.');
      const preceding = participants(rows.slice(0, rows.indexOf(first)));
      const sender = referencedActors(first)[0];
      const prefix = sender !== id && !preceding.includes(sender) ? 'participant ' + sender + '\n  ' : '';
      const renamed = nextId === id ? source : renameReferences(rows, id, nextId, source, edit, text);
      value = renamed.slice(0, at) + prefix + text + '\n  ' + renamed.slice(at);
      at += prefix.length;
    } else {
      value = nextId !== id
        ? renameReferences(rows, id, nextId, source, edit, text)
        : source.slice(0, at) + text + source.slice(edit.end);
    }
    const safe = safeNames(value, at);
    return { source: safe.source, at: safe.at ?? at };
  }
  function move(direction: number) {
    const actor = selectedActor ?? (selected?.kind === 'participant' ? selected.values[0] : undefined);
    if (actor) {
      const neighbour = ids[ids.indexOf(actor) + direction];
      if (!neighbour) return;
      try {
        const edit = moveLane(source, rows, actor, neighbour);
        void commit(edit.source, edit.at);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
      return;
    }
    if (!selected) return;
    const end = selected.close?.end ?? selected.end;
    const startIndex =
      direction > 0 ? (selected.close ? rows.indexOf(selected.close) : index) + 1 : index - 1;
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
  function pick(row?: Statement, actor?: string, inspect = false) {
    if (pending) return;
    const implicitActor = actor && implicit.includes(actor) ? actor : undefined;
    select(row && !implicitActor ? rows.indexOf(row) : -1, true);
    setSelectedActor(implicitActor);
    if (row && textarea.current && draft === source) textarea.current.setSelectionRange(row.start, row.end);
    if (clean && (row || implicitActor) && (inspect || (tool === 'select' && !placementKind))) {
      if (inspect) {
        setPlacementKind(undefined);
        setTool('select');
      }
      openProperties(row, implicitActor, inspect ? {} : undefined);
    } else closeProperties();
  }
  const errorLine = Number(/line (\d+)/i.exec(error)?.[1]);
  const visibleRows = rows.filter((row) => row.kind !== 'end');
  const empty = emptyBlocks(rows);
  const clean = draft === source && !busy;
  const insertion = selected?.close?.start ?? (selected?.kind === 'end' ? selected.start : selected?.end);
  const isBranch = selected && ['else', 'and', 'option'].includes(selected.kind);
  const native = window.__marmerladeRender;
  const openSource = () => {
    discardInsertion();
    closeProperties();
    useDock.setState({ open: true, view: 'mermaid' });
    setTool('select');
    requestAnimationFrame(() => textarea.current?.focus());
  };
  const toggleSource = () => useDock.getState().setOpen(!useDock.getState().open);
  const pickTarget = useEffectEvent((target: SequenceTarget) => {
    if (target.kind === 'participant')
      pick(rows.find((row) => row.kind === 'participant' && row.values[0] === target.id), target.id, true);
    else {
      const row = rows.find((item) => item.start === target.start);
      if (row) pick(row, undefined, true);
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
      // The export is drawn from `drawing.source`; its styles follow that version of the source.
      const exported = picture.querySelector('svg');
      if (exported) {
        const drawn = statements(drawing.source);
        bindSelection(exported, drawn);
        applySequenceStyles(exported, drawn, remapSequenceStyles(source, drawing.source, useDiagram.getState().sequenceStyles));
      }
      await exportImage(picture, 1200);
    } catch (e) {
      setError(String(e));
    } finally {
      staging.remove();
    }
  }
  const sourceStatus = (
    <>
      {empty.map((row) => (
        <p key={row.start} className="sq-note" role="note">
          {nameOf(row.kind)} on line {row.line} has nothing inside, so it cannot be drawn. Add a message
          inside it or remove it.
        </p>
      ))}
      {!owner && (renderError || (draft !== source && error)) && (
        <div className="mf-err" role="alert">
          <pre>{error || renderError}</pre>
          {errorLine > 0 && (
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
  /** Where a palette element goes when it is not placed by clicking the canvas. */
  const placeAt = (kind: string) => {
    if (!['autonumber', 'title', 'acctitle', 'accdescr'].includes(kind)) return insertion ?? source.length;
    // These apply from where they appear, so they go before the first message.
    const first =
      kind === 'autonumber'
        ? rows.find(
            (r) => r.depth === 0 && !['title', 'acctitle', 'accdescr', 'participant', 'box', 'end'].includes(r.kind),
          )
        : rows[0];
    return first?.start ?? source.length;
  };
  const sampleFor = (kind: string) => {
    if (pending || hasPropertyDraft || !clean) return undefined;
    try {
      const at = kind === 'destroy' ? source.length : placeAt(kind);
      const edit = sampleEdit(source, kind, at, explicit && selected ? [selected] : []);
      if (!edit) return undefined;
      const safe = safeNames(edit.source, edit.at);
      return safe.source === failedSample ? undefined : { source: safe.source, at: safe.at ?? edit.at };
    } catch {
      return undefined;
    }
  };
  const showSample = (kind?: string) => {
    const next = kind ? sampleFor(kind) : undefined;
    const message =
      kind === 'message' && next
        ? statements(next.source)
            .filter((row) => row.kind === 'message')
            .findIndex((row) => row.start === next.at)
        : -1;
    setSample(
      kind && next
        ? { kind, base: source, source: next.source, message: message < 0 ? undefined : message }
        : undefined,
    );
  };
  const toolbar = (
    <>
      <div className="mf-group-btns">
        <ToolButton
          label="Select"
          hotkey="V"
          active={tool === 'select' && !placementKind}
          onClick={() => { discardInsertion(); closeProperties(); }}
        >
          <Icon name="cursor" />
        </ToolButton>
        <ElementPalette
          disabledReason={
            pending
              ? 'Insert or cancel the ' + nameOf(pending.kind).toLowerCase() + ' you are adding first.'
              : draft !== source
                ? 'Fix or restore the Mermaid source first.'
                : busy
                  ? 'Updating the diagram…'
                  : undefined
          }
          hasActors={!!ids.length}
          choose={(kind) => {
            closeProperties();
            if (kind === 'participant' || kind === 'message') {
              setPlacementKind(undefined);
              setTool(kind);
            } else if (spatial(kind)) {
              setPlacementKind(kind);
              setTool('select');
            } else beginInsertion(kind, placeAt(kind));
          }}
          sample={showSample}
          hasSample={(kind) => !!sampleFor(kind)}
          move={(kind, point) => placement.current?.move(kind, point)}
          drop={(kind, point) => placement.current?.drop(kind, point)}
          cancel={() => placement.current?.cancel()}
        />
      </div>
      <ToolButton
        label="Undo"
        disabled={!history.length}
        onClick={undo}
      >
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
              setSelectedActor(undefined);
              select(rows.findIndex((r) => at >= r.start && at <= r.end));
            }
          }}
          onChange={(e) => {
            const value = e.target.value;
            cancel();
            if (slots) slots.drafts.set(slots.diagramId, value);
            setDraft(value);
            discardInsertion();
            closeProperties();
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
      {sourceStatus}
    </>
  );
  const outlineContent = (
    <div className="sq-inspector">
      {implicit.length > 0 && (
        <ul className="mf-tree-list" aria-label="Implicit participants">
          {implicit.map((id) => (
            <li key={id}>
              <button
                className="mf-tree-page"
                aria-current={selectedActor === id}
                disabled={!clean}
                onClick={() => pick(undefined, id, true)}
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
              aria-current={row === selected}
              onClick={() => pick(row, undefined, true)}
            >
              <span>{summary(row)}{empty.includes(row) && ' · line ' + row.line}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
  const propertyKind = pending?.kind ?? action?.edit.kind;
  const propertyRow = pending?.row ?? action?.edit;
  const propertyError = previewError || error;
  const properties = propertyKind && (
    <>
      <StatementForm
        key={[propertyKind, propertyRow?.start, action?.implicitId, !!pending].join(':')}
        kind={propertyKind}
        row={propertyRow}
        inserting={!!pending}
        ids={ids}
        names={names}
        note={quiet}
        busy={busy || !candidate || candidate.source !== proposal}
        invalid={!!previewError}
        onDraft={draftProperties}
        onTrial={trialProperties}
        save={(text) => void applyProperties(text)}
        cancel={cancelForm}
      />
      {propertyError && <p className="sq-form-error" role="alert">{propertyError}</p>}
    </>
  );
  const participantSelected = !!selectedActor || selected?.kind === 'participant';
  const quickField = selected?.kind === 'message' ? 'Arrow' : selected?.kind === 'note' ? 'Position' : undefined;
  const labelField = selected?.kind === 'message' ? 'Message' : selected?.kind === 'note' ? 'Note' : undefined;
  const editSelected = (field?: string) => openProperties(selected, selectedActor, { field });
  const commands = (selected || selectedActor) && (
    <>
      {labelField && <button onClick={() => editSelected(labelField)}>Edit text</button>}
      {quickField && <button onClick={() => editSelected(quickField)}>{quickField}</button>}
      <div className="sq-element-actions">
          {selected && branches[selected.kind] && (
            <button onClick={() => beginInsertion(branches[selected.kind], selected.close?.start)}>
              Add {branches[selected.kind]} branch
            </button>
          )}
          {!isBranch && (
            <>
              <button className={participantSelected ? 'sq-move-left' : 'sq-move-up'} aria-label={participantSelected ? 'Move left' : 'Move up'} title={participantSelected ? 'Move left' : 'Move up'} onClick={() => move(-1)}><Icon name="tidy-right" /></button>
              <button className={participantSelected ? '' : 'sq-move-down'} aria-label={participantSelected ? 'Move right' : 'Move down'} title={participantSelected ? 'Move right' : 'Move down'} onClick={() => move(1)}><Icon name="tidy-right" /></button>
            </>
          )}
          <button aria-label={selectedActor ? 'Remove participant' : participantSelected ? 'Remove declaration' : 'Remove'} title={selectedActor ? 'Remove participant' : participantSelected ? 'Remove declaration' : 'Remove'} onClick={() => {
            if (selectedActor) {
              const edit = removeSelection(source, rows, [], [selectedActor]);
              void commit(edit.source, edit.at);
            } else if (selected) {
              void commit(
                source.slice(0, selected.start) + source.slice(selected.close?.end ?? selected.end),
                selected.start,
              );
            }
          }}>
            <Icon name="trash" />
          </button>
      </div>
    </>
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
              ref={placement}
              placementKind={placementKind}
              onPlace={beginInsertion}
              previewSvg={trialSvg || (owner && candidate && candidate.source === proposal ? candidate.svg : undefined)}
              fitPreview={!!pending || (sampleSource !== undefined && trialSource === sampleSource)}
              sampleMessage={trialSvg ? sampleMessage : undefined}
              wrapSelected={explicit}
              onPropose={proposeEdit}
              workspaceZoom={slots?.workspaceZoom}
              svg={svg}
              source={source}
              rows={rows}
              selected={selected}
              selectedActor={selectedActor}
              panel={slots ? slots.stylePanel : localPanel}
              controls={commands}
              properties={propertyKind ? {
                content: properties,
                label: (pending ? 'Add ' : 'Edit ') + nameOf(propertyKind).toLowerCase(),
                cancel: cancelForm,
                ...(pending ? { kind: 'insert' } : { kind: 'edit', focus: propertyFocus }),
              } : undefined}
              editable={!pending && clean && (drawing.source === source || !rows.length)}
              tool={tool}
              onTool={(tool) => {
                setPlacementKind(undefined);
                if (tool !== 'select') closeProperties();
                setTool(tool);
              }}
              onError={setError}
              onCommit={commit}
              onSource={toggleSource}
              onSelect={pick}
            />
          </ReactFlowProvider>
          {!slots && <div className="mf-style-slot" ref={setLocalPanel} />}
          {trialSvg && !pending && (
            <div className="sq-proposal" aria-label="Option preview" role="status">
              <span className="sq-preview-badge">
                {sampleSource !== undefined && trialSource === sampleSource
                  ? 'Example · ' + nameOf(sample!.kind) + ' · choose it to place your own'
                  : 'Preview of the highlighted option · click it to apply'}
              </span>
              {sampleSource !== undefined && trialSource === sampleSource && (
                <span className="sq-preview-note">
                  {descriptions[sample!.kind]} {placementInstruction(sample!.kind)}
                </span>
              )}
            </div>
          )}
          {pending && (
            <div className="sq-proposal" aria-label="Insertion preview" role="status">
              <span className="sq-preview-badge">
                {trialSvg
                  ? 'Preview of the highlighted option · click it to choose'
                  : previewError
                  ? 'Preview unavailable · see the form for details'
                  : candidate
                    ? 'Preview · Insert to keep it, Escape to cancel'
                    : 'Preparing preview…'}
              </span>
            </div>
          )}
          {!owner && !rows.length && tool === 'select' && (
            <div className="sq-empty sq-start">
              <h2>Sequence diagram</h2>
              <button onClick={() => setTool('participant')}>Add participant</button>
              <button onClick={openSource}>Paste Mermaid</button>
            </div>
          )}
          {!owner && (error || renderError) && !(panel && view === 'mermaid' && draft !== source) && (
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
