import { validateSequence } from './sequence/model.ts';
import { useDiagram, workspaceDiagram } from './store.ts';
import { useDock } from './dock.ts';
import { readImageFile } from './imageUpload.ts';
import { captureGif } from './gif.ts';
import { cycleSeconds, frameCount, fitScale, GIF_PIXEL_BUDGET } from './gifMath.ts';
import { flowCycle, flowSeconds, FLOW_LEAD } from './flow.ts';
import { seek, usePlayer } from './flowPlayer.ts';
import { layoutShown, type Direction } from './layout.ts';
import { previewLayout } from './mermaid/previewLayout.ts';
import type { RenderGifOptions, RenderBridge } from './renderContract.ts';

export function measureNodes() {
  return Array.from(document.querySelectorAll<HTMLElement>('.react-flow__node'), element => {
    const rect = element.getBoundingClientRect();
    return { id: element.dataset.id ?? '', x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }).filter(rect => rect.width > 0 && rect.height > 0);
}

function createBridge(fit: () => Promise<void>) {
  return {
    fit,
    diagram: workspaceDiagram,
    measure: measureNodes,
    validateSequence,
    async layout(direction: Direction) {
      const current = workspaceDiagram();
      // the layout the diagram's preview shows; the measured built-in layout if Mermaid cannot draw it
      try {
        return { ...current, ...(await previewLayout({ nodes: current.nodes, edges: current.edges, direction })), ...(direction === 'LR' ? { direction } : {}) };
      } catch {
        // fall through
      }
      const sizes = Object.fromEntries(measureNodes().map(node => [node.id, { width: node.width, height: node.height }]));
      // Measure in canvas coordinates rather than the fitted screen scale.
      const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
      const scale = viewport ? new DOMMatrix(getComputedStyle(viewport).transform).a : 1;
      for (const size of Object.values(sizes)) { size.width /= scale; size.height /= scale; }
      return { ...current, ...layoutShown(current.nodes, current.edges, direction, sizes), ...(direction === 'LR' ? { direction } : {}) };
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
      const current = workspaceDiagram();
      const player = usePlayer.getState();
      const seconds = flowSeconds(player.steps, player.speed);
      const duration = cycleSeconds(current, options.flow ? seconds : 0) || 1;
      if (duration > 30) throw new Error('Animation exceeds the 30 second export limit');
      const rect = element.getBoundingClientRect();
      const scale = fitScale(rect.width, options.maxWidth);
      if (frameCount(duration, options.fps) * rect.width * rect.height * scale * scale > GIF_PIXEL_BUDGET) throw new Error('GIF exceeds the render memory budget. Reduce fps, maxWidth, or animation duration.');
      const blob = await captureGif(element, {
        mode: 'realtime',
        seconds: duration,
        frame: options.flow ? elapsed => seek(-FLOW_LEAD + (elapsed / seconds) * flowCycle(player.steps)) : undefined,
      }, options,
        (frame, total) => { window.__marmerladeProgress = { frame, total }; });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return btoa(binary);
    },
    async pptx() {
      if (!document.querySelector('.react-flow')) throw new Error('PowerPoint export requires the canvas view');
      const { nodes, edges, direction } = useDiagram.getState();
      const { diagramPptx } = await import('./pptx/export.ts');
      const bytes = await diagramPptx(nodes, edges, direction);
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
