import { lazy, Suspense, useEffect, useRef, useImperativeHandle, type Ref } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, undo, redo, undoDepth, redoDepth, isolateHistory } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { autocompletion, startCompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete';
import { workspaceReferences } from '../store';
import { referenceKey, type Reference } from '../references';
import '../components/refs.css';

const RefCard = lazy(() => import('../components/RefCard'));

/** A RefCard inside CodeMirror's completion info panel. */
const preview = (r: Reference) => () => {
  const dom = document.createElement('div');
  dom.className = 'ref-card ref-inline';
  const root = createRoot(dom);
  root.render(<Suspense fallback={null}><RefCard refKey={referenceKey(r)} /></Suspense>);
  return { dom, destroy: () => queueMicrotask(() => root.unmount()) };
};
const KIND_LABEL: Record<Reference['kind'], string> = { page: 'page', deck: 'deck', diagram: 'diagram', node: 'node' };

/** Line-start `/` commands: each types an opener, then offers its targets. */
const SLASH: { label: string; insert: string }[] = [
  { label: 'Link page', insert: '[[' },
  { label: 'Link deck', insert: '[[deck:' },
  { label: 'Link diagram', insert: '[[diagram:' },
  { label: 'Embed diagram', insert: '{{diagram:' },
];
import { tags } from '@lezer/highlight';

const theme = EditorView.theme({
  '&': { height: '100%', background: 'transparent', color: 'var(--mf-text)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--mf-mono)', fontSize: '13px', lineHeight: '1.7', padding: '24px 0' },
  '.cm-content': { caretColor: 'var(--mf-accent)', padding: '0 28px' },
  '.cm-cursor': { borderLeftColor: 'var(--mf-accent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--mf-accent) 28%, transparent)',
  },
  '.cm-tooltip': {
    background: 'var(--mf-panel)',
    border: '1px solid var(--mf-border)',
    borderRadius: '8px',
    color: 'var(--mf-text)',
    fontFamily: 'var(--mf-ui-font)',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    background: 'color-mix(in srgb, var(--mf-accent) 22%, transparent)',
    color: 'var(--mf-text)',
  },
});

const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700', color: 'var(--mf-text)' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: 'var(--mf-accent)' },
  { tag: [tags.monospace, tags.quote], color: 'var(--mf-muted)' },
  { tag: [tags.processingInstruction, tags.contentSeparator], color: 'var(--mf-muted)' },
]);

export interface SourceHistory { undo: () => void; redo: () => void }

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** what `[[` offers; the whole workspace by default */
  references?: () => Reference[];
  /** told where the caret is, as an offset into the text */
  onCaret?: (offset: number) => void;
  /** move the caret and scroll to it; focus unless the caller keeps another panel open */
  caret?: { offset: number; focus?: boolean };
  historyRef?: Ref<SourceHistory>;
  onHistoryChange?: (state: { undo: boolean; redo: boolean }) => void;
}

/** Raw Markdown editor. Remote changes replace the text and keep the caret. */
export default function Editor({ value, onChange, references = workspaceReferences, onCaret, caret, historyRef, onHistoryChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef({ onChange, references, onCaret, onHistoryChange });
  latest.current = { onChange, references, onCaret, onHistoryChange };
  useImperativeHandle(historyRef, () => ({
    undo: () => { if (view.current) undo(view.current); },
    redo: () => { if (view.current) redo(view.current); },
  }), []);

  useEffect(() => {
    const complete = (c: CompletionContext) => {
      const link = c.matchBefore(/\[\[[^\]\n]*/);
      if (link) {
        return {
          from: link.from + 2,
          options: latest.current.references().map((r): Completion => ({
            label: r.target, displayLabel: r.title, detail: KIND_LABEL[r.kind], apply: `${r.target}]]`, info: preview(r),
          })),
          filter: true,
        };
      }
      const embed = c.matchBefore(/^\{\{(diagram|sequence):[^}\n]*/);
      if (embed) {
        const sequence = embed.text.startsWith('{{sequence');
        const refs = latest.current.references().filter((r) => (r.kind === 'diagram' && (!sequence || r.icon === 'sequence')) || (!sequence && r.kind === 'node'));
        return {
          from: embed.from + embed.text.indexOf(':') + 1,
          options: refs.map((r): Completion => ({
            label: r.title, detail: KIND_LABEL[r.kind], apply: `${r.title}}}`, info: preview(r), boost: r.kind === 'diagram' ? 1 : 0,
          })),
          filter: true,
        };
      }
      const slash = c.matchBefore(/^\/[\w ]*/);
      if (slash) {
        return {
          from: slash.from,
          options: SLASH.map(({ label, insert }): Completion => ({
            label: '/' + label.toLowerCase(), displayLabel: label,
            apply: (view, _completion, from, to) => {
              view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
              startCompletion(view);
            },
          })),
          filter: true,
        };
      }
      return null;
    };
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(highlight),
          autocompletion({ override: [complete], icons: false }),
          placeholder('Write…'),
          EditorView.lineWrapping,
          theme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current.onChange(u.state.doc.toString());
            if (u.docChanged || u.selectionSet) latest.current.onCaret?.(u.state.selection.main.head);
            if (u.docChanged) latest.current.onHistoryChange?.({ undo: undoDepth(u.state) > 0, redo: redoDepth(u.state) > 0 });
          }),
        ],
      }),
    });
    view.current = v;
    latest.current.onHistoryChange?.({ undo: false, redo: false });
    return () => v.destroy();
    // one editor per mount; the parent keys it by page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === value) return;
    const at = Math.min(v.state.selection.main.head, value.length);
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, selection: { anchor: at }, annotations: isolateHistory.of('full') });
  }, [value]);

  useEffect(() => {
    const v = view.current;
    if (!v || !caret) return;
    v.dispatch({ selection: { anchor: Math.min(caret.offset, v.state.doc.length) }, scrollIntoView: true });
    if (caret.focus !== false) v.focus();
  }, [caret]);

  return <div className="wk-editor" ref={host} />;
}
