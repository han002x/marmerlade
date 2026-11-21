import { useEffect, useRef, useState } from 'react';
import type { Slide as SlideData } from '../slides';
import Slide from './Slide';

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

export default function SlideThumbnails({ slides, nodeId, current, onSelect }: {
  slides: SlideData[];
  nodeId?: string;
  current: number;
  onSelect: (index: number) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.children[current]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);
  return (
    <ol ref={list} className="sl-thumbnails wk-navigation" aria-label="Slide thumbnails">
      {slides.map((slide, index) => (
        <li key={index} className="sl-thumbnail">
          <span aria-hidden="true" className="sl-thumbnail-number">{index + 1}</span>
          <Thumbnail slide={slide} nodeId={nodeId} />
          <button className="sl-thumbnail-select" aria-label={`Go to slide ${index + 1}`}
            aria-current={current === index ? 'true' : undefined} onClick={() => onSelect(index)} />
        </li>
      ))}
    </ol>
  );
}
