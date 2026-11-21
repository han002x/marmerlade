import { useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Fragment } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import { diagramMarkdown, diagramWidth } from '../diagramEmbed';
import { Icon } from '../components/Icon';
import Preview from './Preview';

export default function DiagramView({ node, editor, getPos, updateAttributes, nodeId, onPage, onNode }: NodeViewProps & {
  nodeId?: string;
  onPage?: (id: string) => void;
  onNode?: (id: string) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: number; available: number; width: number; next: number }>(undefined);
  const [draft, setDraft] = useState<number>();
  const [intrinsicWidth, setIntrinsicWidth] = useState(0);
  const width = draft ?? node.attrs.width;
  const handleLeft = width === null
    ? `calc(50% + min(50%, ${intrinsicWidth / 2}px))`
    : `${50 + width / 2}%`;
  const target = String(node.attrs.target ?? '');
  const position = getPos();
  const resolved = position === undefined ? undefined : editor.state.doc.resolve(position);
  const index = resolved?.index() ?? 0;
  const move = (direction: -1 | 1) => {
    const current = getPos();
    if (current === undefined) return;
    const state = editor.state;
    const location = state.doc.resolve(current);
    const at = location.index() + direction;
    if (at < 0 || at >= location.parent.childCount) return;
    const sibling = location.parent.child(at);
    const start = direction < 0 ? current - sibling.nodeSize : current;
    const end = start + node.nodeSize + sibling.nodeSize;
    const content = Fragment.fromArray(direction < 0 ? [node, sibling] : [sibling, node]);
    const change = state.tr.replaceWith(start, end, content);
    change.setSelection(NodeSelection.create(change.doc, direction < 0 ? start : start + sibling.nodeSize));
    editor.view.dispatch(change.scrollIntoView());
  };
  const measured = () => {
    const el = frame.current;
    const available = el?.parentElement?.clientWidth || 1;
    const actual = el?.querySelector('svg')?.getBoundingClientRect().width ?? available;
    return { available, width: width ?? diagramWidth(actual / available * 100) };
  };
  return <NodeViewWrapper contentEditable={false} className="wk-diagram-block">
    <div className="wk-diagram-tools" role="group" aria-label="Diagram controls">
      <button type="button" className="wk-icon" aria-label="Drag diagram" title="Drag diagram" draggable data-drag-handle><Icon name="tree" size={14} /></button>
      <button type="button" className="wk-icon" aria-label="Move diagram up" title="Move diagram up" disabled={index === 0} onClick={() => move(-1)}>↑</button>
      <button type="button" className="wk-icon" aria-label="Move diagram down" title="Move diagram down" disabled={!resolved || index >= resolved.parent.childCount - 1} onClick={() => move(1)}>↓</button>
    </div>
    <div ref={frame} className="wk-diagram-frame">
      {nodeId || target || node.attrs.sequence ? <div className={width === null ? undefined : 'wk-sized-diagram'}
        style={width === null ? undefined : { width: `${width}%` }}>
        <Preview body={diagramMarkdown(target, null, node.attrs.sequence)} nodeId={nodeId} onPage={onPage} onNode={onNode} onDiagramWidth={setIntrinsicWidth} />
      </div>
        : <span className="wk-empty-links">Link this page to a node to show its diagram.</span>}
      {(nodeId || target || node.attrs.sequence) && <button type="button" className="wk-diagram-resize" aria-label="Resize diagram" title="Resize diagram"
        style={{ left: handleLeft }}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          const size = measured();
          drag.current = { ...size, start: event.clientX, next: size.width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const active = drag.current;
          if (!active) return;
          active.next = diagramWidth(active.width + (event.clientX - active.start) * 200 / active.available);
          setDraft(active.next);
        }}
        onPointerUp={() => {
          const active = drag.current;
          drag.current = undefined;
          setDraft(undefined);
          if (active && active.next !== active.width) updateAttributes({ width: active.next });
        }}
        onLostPointerCapture={() => { drag.current = undefined; setDraft(undefined); }}
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          updateAttributes({ width: diagramWidth(measured().width + (event.key === 'ArrowLeft' ? -5 : 5)) });
        }}><span aria-hidden="true">↔</span></button>}
    </div>
  </NodeViewWrapper>;
}
