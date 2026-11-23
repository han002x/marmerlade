import { useEffect, useRef, useState } from 'react';
import type { Slide as SlideData } from '../slides';
import { matchesTitle } from '../wiki/libraryTitles';
import Slide from './Slide';
import ContextMenu from '../wiki/ContextMenu';
import type { SlideEdit } from '../slides';

function Thumbnail({ slide, nodeId }: { slide: SlideData; nodeId?: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '140px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={frame} className="sl-thumbnail-preview" aria-hidden="true" inert>
    {visible && <Slide slide={slide} nodeId={nodeId} />}
  </div>;
}

export default function SlideThumbnails({ slides, query, nodeId, current, onSelect, onEdit }: {
  slides: SlideData[];
  query: string;
  nodeId?: string;
  current: number;
  onSelect: (index: number) => void;
  onEdit: (kind: SlideEdit, index: number) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current, query]);
  const matching = slides.map((slide, index) => ({ slide, index })).filter(({ slide }) => matchesTitle(slide.body, query));
  return (
    <>
    <ol ref={list} className="sl-thumbnails wk-navigation" aria-label="Slide thumbnails">
      {matching.map(({ slide, index }) => (
        <li key={index} className="sl-thumbnail">
          <ContextMenu label={`Slide ${index + 1} actions`} items={<>
            <button role="menuitem" onClick={() => onEdit('add', index)}>Add slide after</button>
            <button role="menuitem" onClick={() => onEdit('duplicate', index)}>Duplicate</button>
            <button role="menuitem" disabled={index === 0} onClick={() => onEdit('up', index)}>Move up</button>
            <button role="menuitem" disabled={index === slides.length - 1} onClick={() => onEdit('down', index)}>Move down</button>
            <button role="menuitem" className="danger" onClick={() => onEdit('remove', index)}>Delete slide</button>
          </>}>
          <span aria-hidden="true" className="sl-thumbnail-number">{index + 1}</span>
          <Thumbnail slide={slide} nodeId={nodeId} />
          <button className="sl-thumbnail-select" aria-label={`Go to slide ${index + 1}`}
            aria-current={current === index ? 'true' : undefined} onClick={() => onSelect(index)} />
          </ContextMenu>
        </li>
      ))}
    </ol>
    {matching.length === 0 && <p className="wk-index-empty" role="status">No matching slides</p>}
    </>
  );
}
