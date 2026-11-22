import { useEffect, useLayoutEffect, useRef } from 'react';
import { useReactFlow, useStoreApi, type FitViewOptions, type Viewport } from '@xyflow/react';

/** Scale an editor's viewport with the workspace without scaling its pointer coordinates. */
export function useWorkspaceZoom(workspaceZoom?: number) {
  const { getViewport, setViewport } = useReactFlow();
  const previous = useRef(workspaceZoom);

  useLayoutEffect(() => {
    const oldZoom = previous.current;
    previous.current = workspaceZoom;
    if (!workspaceZoom || !oldZoom || oldZoom === workspaceZoom) return;

    const { x, y, zoom } = getViewport();
    const ratio = workspaceZoom / oldZoom;
    void setViewport({ x: x * ratio, y: y * ratio, zoom: zoom * ratio });
  }, [workspaceZoom, getViewport, setViewport]);
}

/**
 * Fit an editor embedded in the workspace to its pane, and fit again each time the pane is
 * resized until the view is moved. The editor can open before the workspace's own first fit
 * shrinks its pane, so a single fit would frame the diagram in the old, larger pane.
 */
export function useEmbeddedFit(options?: FitViewOptions) {
  const store = useStoreApi();
  const { fitView, getViewport } = useReactFlow();
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const enabled = Boolean(options);

  useEffect(() => {
    if (!enabled) return;
    // The last pane size fitted to, and the view that fit produced.
    const last: { size?: string; view?: Viewport } = {};
    const unsubscribe = store.subscribe(fit);
    function fit({ nodesInitialized, width, height, transform: [x, y, zoom] }: ReturnType<typeof store.getState>) {
      if (!nodesInitialized || !width || !height) return;
      const { view } = last;
      if (view && (view.x !== x || view.y !== y || view.zoom !== zoom)) return unsubscribe();
      if (last.size === `${width}x${height}`) return;
      last.size = `${width}x${height}`;
      void fitView(latest.current).then(() => {
        last.view = getViewport();
      });
    }
    fit(store.getState());
    return unsubscribe;
  }, [enabled, store, fitView, getViewport]);
}
