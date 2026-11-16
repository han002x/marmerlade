import { useDiagram } from './store.ts';
import { useDock } from './dock.ts';
import { readImageFile } from './imageUpload.ts';
import { captureGif } from './gif.ts';
import { cycleSeconds, frameCount, fitScale } from './gifMath.ts';
import { flowCycle, flowSeconds, FLOW_LEAD } from './flow.ts';
import { seek, usePlayer } from './flowPlayer.ts';
import { layout, type Direction } from './layout.ts';
import type { RenderGifOptions, RenderBridge } from './renderContract.ts';

const diagram = () => {
  const { nodes, edges, pages, decks } = useDiagram.getState();
  return { nodes, edges, pages, decks };
};
export function measureNodes() {
  return Array.from(document.querySelectorAll<HTMLElement>('.react-flow__node'), element => {
    const rect = element.getBoundingClientRect();
    return { id: element.dataset.id ?? '', x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }).filter(rect => rect.width > 0 && rect.height > 0);
}

function createBridge(fit: () => Promise<void>) {
  return {
    fit,
    diagram,
    measure: measureNodes,
    layout(direction: Direction) {
      const current = diagram();
      const sizes = Object.fromEntries(measureNodes().map(node => [node.id, { width: node.width, height: node.height }]));
      // Measure in canvas coordinates rather than the fitted screen scale.
      const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
      const scale = viewport ? new DOMMatrix(getComputedStyle(viewport).transform).a : 1;
      for (const size of Object.values(sizes)) { size.width /= scale; size.height /= scale; }
      const positions = layout(current.nodes, current.edges, direction, sizes);
      return { ...current, nodes: current.nodes.map(node => ({ ...node, position: positions[node.id] ?? node.position })) };
    },
    async importImage(base64: string, name: string, mime: string) {
      const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
      const image = await readImageFile(new File([bytes], name, { type: mime }));
      const preview = new Image();
      preview.src = image.src;
      await preview.decode();
      return image;
    },
    async gif(options: RenderGifOptions) {
      const element = document.querySelector<HTMLElement>('.react-flow');
      if (!element) throw new Error('GIF export requires the canvas view');
      const current = diagram();
      const player = usePlayer.getState();
      const seconds = flowSeconds(player.steps, player.speed);
      const duration = cycleSeconds(current, options.flow ? seconds : 0) || 1;
      if (duration > 30) throw new Error('Animation exceeds the 30 second export limit');
      const rect = element.getBoundingClientRect();
      const scale = fitScale(rect.width, options.maxWidth);
      if (frameCount(duration, options.fps) * rect.width * rect.height * scale * scale > 64_000_000) throw new Error('GIF exceeds the render memory budget. Reduce fps, maxWidth, or animation duration.');
      const blob = await captureGif(element, current, options,
        options.flow ? { seconds, frame: elapsed => seek(-FLOW_LEAD + (elapsed / seconds) * flowCycle(player.steps)) } : undefined,
        (frame, total) => { window.__marmerladeProgress = { frame, total }; });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return btoa(binary);
    },
  } satisfies RenderBridge;
}

export function installRenderBridge(fit: () => Promise<void>) {
  if (!window.__marmerladeRender) return;
  useDock.getState().setOpen(false);
  window.marmerladeRenderer = createBridge(fit);
  return () => { delete window.marmerladeRenderer; };
}
