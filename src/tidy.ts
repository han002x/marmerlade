import { useDiagram } from './store';
import { previewLayout } from './mermaid/previewLayout';
import type { FlowDirection } from './types';

/**
 * Tidy the open flowchart into the layout its preview shows: Mermaid lays it
 * out, and the canvas takes Mermaid's positions, sizes and edge paths. With a
 * `direction` the diagram turns that way first. `undoable: false` folds the
 * result into the change before it (an import's own undo step).
 *
 * Nothing happens if the diagram changes while Mermaid draws. If Mermaid cannot
 * draw it, an undoable Tidy falls back to the built-in layout.
 */
export async function tidyAsPreview(direction?: FlowDirection, { undoable = true } = {}): Promise<void> {
  const start = useDiagram.getState();
  const dir = direction ?? start.direction;
  const unchanged = () => {
    const now = useDiagram.getState();
    return now.nodes === start.nodes && now.edges === start.edges && now.activeDiagramId === start.activeDiagramId;
  };
  if (start.nodes.length === 0) return;
  try {
    const laid = await previewLayout({ nodes: start.nodes, edges: start.edges, direction: dir });
    if (unchanged()) useDiagram.getState().applyLayout(laid.nodes, laid.edges, dir, undoable);
  } catch {
    if (undoable && unchanged()) useDiagram.getState().autoLayout(dir);
  }
}
