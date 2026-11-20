import { useLayoutEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';

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
