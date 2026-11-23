import { createPortal } from 'react-dom';
import type { EditorSlots, SequenceTarget } from '../diagrams/editorSlots';
import { useDock } from '../dock';
import { parseMermaid } from '../mermaid/io';
import { ReactFlowProvider } from '@xyflow/react';
import { ToolButton } from '../components/ToolButton';
import { FlowControls } from '../components/FlowControls';
import { ExportMenu, type ExportFormat } from '../components/ExportMenu';
import { Icon } from '../components/Icon';
import { ElementPalette, ElementTool } from './ElementPalette';
import { insertElement, placeElement, sampleEdit } from './insertion';
import { moveLane, removeSelection, type CanvasEdit } from './canvasEdits';
import SequenceCanvas, { type PlacementHandle, type Tool } from './SequenceCanvas';
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDiagram } from '../store';
import { parseParticipantOwner, participantOwner } from '../linkOwners';
import { activeAppearance, useAppearance } from '../theme';
import { diagramSvg } from '../mermaid/svg';
import { exportGif, exportImage, GIF_DEFAULTS } from '../gif';
import { exportHeight, GIF_PIXEL_BUDGET } from '../gifMath';
import { flowCycle, flowSeconds, FLOW_LEAD } from '../flow';
import { usePlayer } from '../flowPlayer';
import {
  emptyBlocks,
  spatial,
  branches,
  nameOf,
  renameReferences,
  format,
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
import { addMessageTraces } from './messageTraces';
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
  const messageSteps = useMemo(() => {
    const steps = new Map<number, number>();
    for (const row of rows) {
      if (row.kind === 'message') steps.set(row.start, steps.size);
    }
    return steps;
  }, [rows]);
  const ids = useMemo(() => participants(rows), [rows]);
  const [index, setIndex] = useState(-1);
  // Only a selection the user made may be wrapped.
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
  const [renderError, setRenderError] = useState('');
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState('');
  const exportSvg = useMemo(() => {
    if (!svg) return null;
    const template = document.createElement('template');
    template.innerHTML = svg;
    return template.content.querySelector('svg');
  }, [svg]);
  const exportSize = exportSvg?.viewBox.baseVal ?? { width: 0, height: 0 };
  const canExport = drawing.source === source && !renderError && exportSize.width >= 2 && exportSize.height >= 2;
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
  const syncSource = useEffectEvent(() => {
    cancel();
    setDraft(source);
    closeProperties();
    select(-1);
    setSelectedActor(undefined);
    setError('');
    base.current = source;
  });
  useEffect(() => {
    if (base.current !== source) syncSource();
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
    resetPlacement();
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

  function resetPlacement() {
    setPlacementKind(undefined);
    setTool('select');
  }
  function cancelForm() {
    if (action) cancel();
    closeProperties();
  }
  useEffect(() => {
    resetPlacement();
  }, [source, slots?.diagramId]);
  const dismissCanvasEdits = useEffectEvent(() => {
    cancelForm();
    resetPlacement();
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
  function insertPlaced(build: () => CanvasEdit) {
    if (!clean) return;
    closeProperties();
    resetPlacement();
    setSample(undefined);
    try {
      const edit = build();
      const safe = safeNames(edit.source, edit.at);
      const issue = lifetimeIssue(statements(safe.source));
      if (issue) throw new Error(issue);
      void commit(safe.source, safe.at ?? edit.at);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }
  function insertAt(kind: string, at = insertion ?? source.length, selection: Statement[] = [], actor?: string) {
    insertPlaced(() => placeElement(source, kind, at, selection, actor));
  }

  // Icon and dropdown picks in an open edit form apply as soon as their preview is ready;
  // typed text waits for Enter. The form then reopens on the edited element.
  const draftText = useRef('');
  const autoApply = useRef(false);
  const reopenAfter = useRef<string>(undefined);
  const draftProperties = (text: string, changed: boolean) => {
    draftText.current = text;
    // Picking the original value again leaves nothing to apply.
    if (!changed) autoApply.current = false;
    if (!action) return;
    try {
      setProposal(changed ? buildExisting(action, text).source : source);
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
    if (!action || proposal === undefined) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
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
  }, [action, proposal, appearance, source]);
  // The option under the pointer in an open dropdown, drawn in place until the pointer leaves.
  // Owned by the open form, so a trial left behind by a closed form is never drawn.
  const [trial, setTrial] = useState<{ owner: object; base: string; source: string }>();
  // A palette tile under the pointer, drawn as an example in this diagram.
  const [sample, setSample] = useState<{ kind: string; base: string; source: string; message?: number }>();
  const hasPropertyDraft = !!previewError || (proposal !== undefined && proposal !== source);
  const sampleSource = sample && sample.base === source && !hasPropertyDraft ? sample.source : undefined;
  const trialSource =
    (trial && trial.owner === action && trial.base === source ? trial.source : undefined) ?? sampleSource;
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
    setTrial(next === undefined || !action ? undefined : { owner: action, base: source, source: next });
  const trialProperties = (text: string | undefined) => {
    if (text === undefined || !action) return offer();
    try {
      offer(buildExisting(action, text).source);
    } catch {
      offer();
    }
  };
  async function applyProperties(text: string) {
    if (!action || !candidate) return;
    try {
      const edit = buildExisting(action, text);
      if (edit.source !== candidate.source) return;
      if (edit.source === source) closeProperties();
      else {
        reopenAfter.current = source;
        if (!(await commit(edit.source, edit.at))) reopenAfter.current = undefined;
      }
    } catch (reason) {
      setPreviewError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const applyPick = useEffectEvent(() => {
    if (!autoApply.current || !action) return;
    if (previewError) autoApply.current = false;
    if (!candidate || candidate.source !== proposal || proposal === source) return;
    autoApply.current = false;
    void applyProperties(draftText.current);
  });
  useEffect(() => applyPick(), [candidate, proposal, previewError]);
  // A commit closes the form; an edit made from it keeps it open on the same element.
  const reopen = useEffectEvent(() => {
    if (reopenAfter.current === undefined || reopenAfter.current === source || action || busy || draft !== source)
      return;
    reopenAfter.current = undefined;
    if (selected || selectedActor) openProperties(selected, selectedActor);
  });
  useLayoutEffect(() => reopen(), [source, draft, action, busy, selected, selectedActor]);

  const implicit = ids.filter(
    (id) => !rows.some((row) => row.kind === 'participant' && row.values[0] === id),
  );
  function closeProperties() {
    previewRevision.current++;
    autoApply.current = false;
    reopenAfter.current = undefined;
    setAction(undefined);
    setPropertyFocus(undefined);
    setCandidate(undefined);
    setProposal(undefined);
    setPreviewError('');
    if (action) setError('');
  }
  function openProperties(row: Statement | undefined, actor: string | undefined, focus?: PropertyFocus) {
    if (!clean) return;
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
    if (edit.kind === 'participant' && !edit.values[4] && next.values[4]) {
      const updated = statements(value);
      const creation = updated.findIndex((row) => row.start === at);
      if (creation >= 0) {
        const following = updated.slice(creation + 1).find(
          (row) => row.kind === 'message' || (row.kind === 'participant' && row.values[4]),
        );
        if (following?.kind !== 'message' || following.values[1] !== nextId) {
          const sender = participants(updated.slice(0, creation)).find((actor) => actor !== nextId) ?? nextId;
          const message = format('message', [sender, nextId, '->>', 'Create']);
          value = insertElement(value, message, 'message', updated[creation + 1]?.start ?? value.length).source;
        }
      }
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
    resetPlacement();
    closeProperties();
    useDock.setState({ open: true, view: 'mermaid' });
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
  // The page and slides tabs follow the selected participant, and a participant's page or
  // slides button selects it here.
  const diagramId = slots?.diagramId;
  const activeActor = selectedActor ?? (selected?.kind === 'participant' ? selected.values[0] : undefined);
  const wantedParticipant = useDock((state) => state.participant);
  useEffect(() => {
    if (diagramId) useDock.getState().setParticipant(activeActor ? participantOwner(diagramId, activeActor) : null);
  }, [diagramId, activeActor]);
  useEffect(
    () => () => {
      const current = useDock.getState().participant;
      if (diagramId && current && parseParticipantOwner(current)?.diagramId === diagramId)
        useDock.getState().setParticipant(null);
    },
    [diagramId],
  );
  const pickParticipant = useEffectEvent((actor: string) => {
    if (actor !== activeActor) pick(rows.find((row) => row.kind === 'participant' && row.values[0] === actor), actor);
  });
  useEffect(() => {
    const wanted = wantedParticipant ? parseParticipantOwner(wantedParticipant) : null;
    if (wanted && wanted.diagramId === diagramId) pickParticipant(wanted.actor);
  }, [wantedParticipant, diagramId]);
  async function saveExport(format: ExportFormat, width: number) {
    if (!canExport || exporting || !exportSvg) return;
    setExporting(format);
    setExportError('');
    const exported = document.importNode(exportSvg, true);
    const picture = document.createElement('div');
    picture.className = 'sq-export';
    picture.appendChild(exported);
    picture.style.width = exportSize.width + 'px';
    picture.style.height = exportSize.height + 'px';
    const staging = document.createElement('div');
    staging.className = 'sq-export-stage';
    staging.inert = true;
    staging.appendChild(picture);
    document.body.appendChild(staging);
    try {
      bindSelection(exported, rows);
      applySequenceStyles(exported, rows, useDiagram.getState().sequenceStyles);
      // html-to-image only looks at HTML elements when it collects fonts to embed.
      const fonts = document.createElement('span');
      fonts.hidden = true;
      fonts.style.fontFamily = [...new Set(Array.from(
        exported.querySelectorAll('text, tspan, foreignObject *'),
        (label) => getComputedStyle(label).fontFamily,
      ))].join(', ');
      picture.appendChild(fonts);
      if (format === 'png') {
        await exportImage(picture, width);
        return;
      }

      const player = usePlayer.getState();
      const steps = messageSteps.size;
      const loop = player.sig === `sequence:${source}` && (player.playing || player.lit)
        ? flowSeconds(steps, player.speed)
        : 0;
      if (loop) addMessageTraces(exported, messageSteps);

      const animations = picture.getAnimations({ subtree: true });
      let seconds = loop;
      for (const animation of animations) {
        const timing = animation.effect?.getTiming();
        if (typeof timing?.duration === 'number') {
          const iterations = timing.direction?.startsWith('alternate') ? 2 : 1;
          seconds = Math.max(seconds, timing.duration * iterations / 1000);
        }
        animation.pause();
      }
      const maxFrames = Math.floor(GIF_PIXEL_BUDGET / (width * exportHeight(width, exportSize)));
      const fps = seconds ? Math.min(GIF_DEFAULTS.fps, Math.floor(maxFrames / seconds)) : 1;
      if (maxFrames < 1 || fps < 1) throw new Error('The GIF is too large. Choose a lower resolution or shorten the animation.');
      await exportGif(picture, {
        mode: 'seek',
        seconds,
        frame: (elapsed) => {
          for (const animation of animations) animation.currentTime = elapsed * 1000;
          if (loop) picture.style.setProperty('--mf-flow-t', String(-FLOW_LEAD + (elapsed / loop % 1) * flowCycle(steps)));
        },
      }, { maxWidth: width, upscale: true, sharedPalette: false, fps });
    } catch (error) {
      setExportError(`Couldn't export ${format.toUpperCase()}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      staging.remove();
      setExporting(null);
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
      {!action && (renderError || (draft !== source && error)) && (
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
    if (hasPropertyDraft || !clean) return undefined;
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
  const paletteProps = {
    disabledReason: draft !== source
      ? 'Fix or restore the Mermaid source first.'
      : busy
        ? 'Updating the diagram…'
        : undefined,
    hasActors: !!ids.length,
    choose: (kind: string) => {
      if (!spatial(kind)) return insertAt(kind, placeAt(kind));
      closeProperties();
      if (kind === 'participant' || kind === 'message') {
        setPlacementKind(undefined);
        setTool(kind);
      } else {
        setPlacementKind(kind);
        setTool('select');
      }
    },
    sample: showSample,
    hasSample: (kind: string) => !!sampleFor(kind),
    move: (kind: string, point: Parameters<PlacementHandle['move']>[1]) => placement.current?.move(kind, point),
    drop: (kind: string, point: Parameters<PlacementHandle['drop']>[1]) => placement.current?.drop(kind, point),
    cancel: () => placement.current?.cancel(),
  };
  const toolbar = (
    <>
      <div className="mf-group-btns">
        {([
          { kind: 'participant', icon: 'lifeline-start', hotkey: 'R' },
          { kind: 'message', icon: 'arrow', hotkey: undefined },
          { kind: 'note', icon: 'note-over', hotkey: undefined },
        ] as const).map(({ kind, icon, hotkey }) => (
          <ElementTool key={kind} {...paletteProps} kind={kind} icon={icon} hotkey={hotkey}
            active={kind === 'note' ? placementKind === kind : tool === kind} />
        ))}
        <ElementPalette {...paletteProps} group="blocks" />
        <ElementPalette {...paletteProps} group="advanced" />
      </div>
      <ToolButton
        label="Undo"
        disabled={!history.length}
        onClick={undo}
      >
        <span aria-hidden="true">↶</span>
      </ToolButton>
      <span className="mf-sep" />
      <div className="mf-group-btns">
        <FlowControls sig={`sequence:${source}`} steps={drawing.source === source && svg ? messageSteps.size : 0} />
      </div>
      <span className="mf-sep" />
      <ExportMenu size={exportSize} disabled={!canExport} exporting={exporting} onExport={saveExport} />
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
            resetPlacement();
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
  const propertyRow = action?.edit;
  const propertyKind = propertyRow?.kind;
  const propertyError = previewError || error;
  const participantSelected = !!selectedActor || selected?.kind === 'participant';
  const inForm = !!propertyKind && ['participant', 'message', 'note'].includes(propertyKind);
  /** Runs an action from the open form, keeping the form open if it changes the source. */
  const keepForm = (run: () => void) => {
    const keep = inForm ? source : undefined;
    run();
    reopenAfter.current = keep;
  };
  const actions = (
    <>
          {!isBranch && (
            <>
              <button type="button" className={participantSelected ? 'sq-move-left' : 'sq-move-up'} aria-label={participantSelected ? 'Move left' : 'Move up'} title={participantSelected ? 'Move left' : 'Move up'} onClick={() => keepForm(() => move(-1))}><Icon name="tidy-right" /></button>
              <button type="button" className={participantSelected ? '' : 'sq-move-down'} aria-label={participantSelected ? 'Move right' : 'Move down'} title={participantSelected ? 'Move right' : 'Move down'} onClick={() => keepForm(() => move(1))}><Icon name="tidy-right" /></button>
            </>
          )}
          <button type="button" aria-label={selectedActor ? 'Remove participant' : participantSelected ? 'Remove declaration' : 'Remove'} title={selectedActor ? 'Remove participant' : participantSelected ? 'Remove declaration' : 'Remove'} onClick={() => {
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
    </>
  );
  const properties = action && propertyRow && (
    <>
      <StatementForm
        key={[propertyKind, propertyRow.start, action.implicitId].join(':')}
        row={propertyRow}
        ids={ids}
        names={names}
        busy={busy || !candidate || candidate.source !== proposal}
        invalid={!!previewError}
        onDraft={draftProperties}
        onTrial={trialProperties}
        onPick={() => (autoApply.current = true)}
        save={(text) => void applyProperties(text)}
        cancel={cancelForm}
        actions={inForm ? actions : undefined}
      />
      {propertyError && <p className="sq-form-error" role="alert">{propertyError}</p>}
    </>
  );
  const branch = selected && branches[selected.kind];
  const commands = (selected || selectedActor) && (!inForm || branch) && (
    <>
      <div className="sq-element-actions">
          {selected && branch && (
            <button onClick={() => insertAt(branch, selected.close?.start)}>
              Add {branch} branch
            </button>
          )}
          {!inForm && actions}
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
      {exporting === 'gif' && createPortal(
        <div className="mf-export-overlay" role="status"><span>Exporting GIF…</span></div>,
        document.body,
      )}
      <div className="sq-work">
        <section className="sq-board">
          {exportError && <div className="mf-notice" role="alert">{exportError}</div>}
          <ReactFlowProvider>
            <SequenceCanvas
              ref={placement}
              placementKind={placementKind}
              onPlace={insertAt}
              previewSvg={trialSvg || (action && candidate && candidate.source === proposal ? candidate.svg : undefined)}
              fitPreview={sampleSource !== undefined && trialSource === sampleSource}
              sampleMessage={trialSvg ? sampleMessage : undefined}
              wrapSelected={explicit}
              onInsert={insertPlaced}
              workspaceZoom={slots?.workspaceZoom}
              svg={svg}
              source={source}
              rows={rows}
              messageSteps={drawing.source === source ? messageSteps : undefined}
              selected={selected}
              selectedActor={selectedActor}
              diagramId={diagramId}
              panel={slots ? slots.stylePanel : localPanel}
              controls={commands}
              properties={propertyKind ? {
                content: properties,
                label: 'Edit ' + nameOf(propertyKind).toLowerCase(),
                cancel: cancelForm,
                focus: propertyFocus,
              } : undefined}
              editable={clean && (drawing.source === source || !rows.length)}
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
          {trialSvg && (
            <div className="sq-proposal" aria-label="Option preview" role="status">
              {!(sampleSource !== undefined && trialSource === sampleSource) && (
                <span className="sq-preview-badge">Preview of the highlighted option · click it to apply</span>
              )}
              {sampleSource !== undefined && trialSource === sampleSource && (
                <span className="sq-preview-note">
                  {descriptions[sample!.kind]} {placementInstruction(sample!.kind)}
                </span>
              )}
            </div>
          )}
          {!action && !rows.length && tool === 'select' && (
            <div className="sq-empty sq-start">
              <h2>Sequence diagram</h2>
              <button onClick={() => setTool('participant')}>Add participant</button>
              <button onClick={openSource}>Paste Mermaid</button>
            </div>
          )}
          {!action && (error || renderError) && !(panel && view === 'mermaid' && draft !== source) && (
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
