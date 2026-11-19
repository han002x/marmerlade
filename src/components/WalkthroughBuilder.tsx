import { useRef, useState } from 'react';
import type { DiagramNode } from '../types';
import { Icon } from './Icon';

export default function WalkthroughBuilder({ nodes, stops, onChange, onSave, onCancel }: {
  nodes: DiagramNode[];
  stops: string[];
  onChange: (stops: string[]) => void;
  onSave: (title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const byId = new Map(nodes.map((node) => [node.id, node]));

  function move(index: number, to: number) {
    const next = [...stops];
    next.splice(to, 0, ...next.splice(index, 1));
    onChange(next);
    requestAnimationFrame(() => list.current?.children[to]?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
  }

  return <section className="mf-walk-builder" aria-label="Create walkthrough" onKeyDown={(event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  }}>
    <div className="mf-walk-head">
      <Icon name="deck" size={17} />
      <input aria-label="Walkthrough title" placeholder="Untitled walkthrough" value={title}
        onChange={(event) => setTitle(event.target.value)} />
      <button className="mf-walk-save" disabled={!stops.length}
        onClick={() => onSave(title.trim() || 'Untitled walkthrough')}>Save</button>
      <button className="mf-tool" aria-label="Cancel walkthrough" title="Cancel walkthrough" onClick={onCancel}>
        <Icon name="close" size={15} />
      </button>
    </div>
    <select aria-label="Add a stop" value="" onChange={(event) => onChange([...stops, event.target.value])}>
      <option value="" disabled>Click a node or choose a stop…</option>
      {nodes.map((node) => <option key={node.id} value={node.id}>{node.label || node.id}</option>)}
    </select>
    {stops.length > 0 && <ol ref={list} aria-label="Walkthrough stops">
      {stops.map((id, index) => <li key={index}>
        <span className="mf-walk-number">{index + 1}</span>
        <span className="mf-walk-label">{byId.get(id)?.label || id}</span>
        <button disabled={index === 0} aria-label={`Move stop ${index + 1} earlier`} onClick={() => move(index, index - 1)}>↑</button>
        <button disabled={index === stops.length - 1} aria-label={`Move stop ${index + 1} later`} onClick={() => move(index, index + 1)}>↓</button>
        <button aria-label={`Remove stop ${index + 1}`} onClick={() => onChange(stops.filter((_, i) => i !== index))}>×</button>
      </li>)}
    </ol>}
  </section>;
}
