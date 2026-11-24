import { useEffect, useRef, useState } from 'react';
import { useDiagram } from '../store';
import { parseMermaid } from '../mermaid/io';
import { isSequence, statements, validateSequence } from '../sequence/model';
import { diagramSvg } from '../mermaid/svg';
import { activeAppearance } from '../theme';
import { tidyAsPreview } from '../tidy';

/**
 * Source box for a workspace with no diagram open. Pasted Mermaid creates a
 * flowchart or a sequence diagram, whichever the text says it is.
 */
export function PasteSource() {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const latest = useRef('');

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  async function create(src: string) {
    if (!src.trim()) return setErr(null);
    const store = useDiagram.getState();
    try {
      if (isSequence(src)) {
        await (statements(src).length ? diagramSvg(src, activeAppearance()) : validateSequence(src));
        if (latest.current !== src) return;
        store.createDiagram({ kind: 'sequence', source: src });
        return;
      }
      const parsed = parseMermaid(src);
      if (!parsed.ok) return setErr(parsed.error);
      store.createDiagram({ kind: 'flowchart', nodes: [], edges: [] });
      if (store.syncMermaid(src, { tidy: true }).ok) await tidyAsPreview(undefined, { undoable: false });
    } catch (error) {
      if (latest.current === src) setErr(String(error));
    }
  }

  function change(src: string) {
    setText(src);
    latest.current = src;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void create(src);
    }, 400);
  }

  return (
    <>
      <div className="mf-mermaid-wrap">
        <textarea
          className="mf-mermaid-text"
          value={text}
          spellCheck={false}
          placeholder="Paste Mermaid"
          aria-label="Mermaid source"
          onChange={(event) => change(event.target.value)}
        />
      </div>
      {err && <div className="mf-err">{err}</div>}
    </>
  );
}
