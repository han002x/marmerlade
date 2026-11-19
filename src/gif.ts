// Animated-GIF export. Captures the live React Flow viewport frame by frame
// over one animation cycle and encodes a size-optimised, looping GIF.
//
// Capture is DOM-based (html-to-image), so the GIF matches exactly what is on
// screen — the same node/edge motion presets the user set in the style panel.
// The loop-length/frame/scale maths lives in gifMath.ts (pure, unit-tested);
// this module holds only the browser capture + encode path.

import { toCanvas } from 'html-to-image';
import GIF from 'gif.js';
import workerUrl from 'gif.js/dist/gif.worker.js?url';
import type { Diagram } from './types';
import { preparePaperTexture, prepareSvgStyles } from './gifCapture';
import {
  GIF_DEFAULTS,
  cycleSeconds,
  fitScale,
  frameCount,
  frameDelayMs,
  gifFileName,
} from './gifMath';

export { GIF_DEFAULTS, cycleSeconds, frameCount, frameDelayMs, fitScale, gifFileName };

/**
 * A sequenced flow to record: its loop length, and a hook that sets the flow
 * clock for the frame taken `elapsed` seconds into the capture.
 */
export interface FlowCapture {
  seconds: number;
  frame: (elapsed: number) => void;
}

export interface GifOptions {
  fps: number;
  maxWidth: number;
  quality: number;
  stillSeconds: number;
  upscale: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Capture the given element's animation to a looping GIF and download it.
 * `diagram` is read only to size the loop to the slowest animation; the pixels
 * come entirely from the live DOM so the result matches the canvas.
 */
export async function captureGif(
  element: HTMLElement,
  diagram: Diagram,
  opts: Partial<GifOptions> = {},
  flow?: FlowCapture,
  progress?: (frame: number, total: number) => void,
): Promise<Blob> {
  const { fps, maxWidth, quality, stillSeconds } = { ...GIF_DEFAULTS, ...opts };

  const rect = element.getBoundingClientRect();
  const srcW = Math.max(1, Math.round(rect.width));
  const srcH = Math.max(1, Math.round(rect.height));
  if (srcW < 2 || srcH < 2) throw new Error('The diagram has no capture area');

  const scale = opts.upscale ? maxWidth / srcW : fitScale(srcW, maxWidth);
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));

  const seconds = cycleSeconds(diagram, flow?.seconds) || stillSeconds;
  const frames = frameCount(seconds, fps);
  const delay = frameDelayMs(fps);

  // React Flow is transparent. Flatten onto the theme's paper color before
  // encoding, since GIF cannot retain the canvas's alpha channel.
  const bg =
    getComputedStyle(element).getPropertyValue('--mf-bg').trim() ||
    '#ffffff';

  const gif = new GIF({
    workers: 2,
    quality,
    width: outW,
    height: outH,
    repeat: 0, // 0 = loop forever
    background: bg,
    transparent: null,
    workerScript: workerUrl,
  });

  const captureOpts = captureOptions(srcW, srcH, outW, outH, bg);
  const paletteCanvas = document.createElement('canvas');
  paletteCanvas.width = 256;
  paletteCanvas.height = 256;
  const paletteContext = paletteCanvas.getContext('2d');
  if (!paletteContext) throw new Error('Cannot create the GIF palette canvas');
  paletteContext.fillStyle = bg;
  paletteContext.fillRect(0, 0, 256, 256);
  const samples = Math.min(frames, 16);

  await document.fonts.ready;
  const restoreTexture = await preparePaperTexture(element);
  try {
    for (let i = 0; i < frames; i++) {
      flow?.frame((i / frames) * seconds);
      const restoreStyles = prepareSvgStyles(element);
      try {
        const canvas = await toCanvas(element, captureOpts);
        gif.addFrame(canvas, { delay, copy: true });
        const sample = Math.floor(i * samples / frames);
        if (i === Math.ceil(sample * frames / samples)) {
          paletteContext.drawImage(canvas, (sample % 4) * 64, Math.floor(sample / 4) * 64, 64, 64);
        }
      } finally {
        restoreStyles();
      }
      progress?.(i + 1, frames);
      if (i < frames - 1) await sleep((seconds * 1000) / frames);
    }
  } finally {
    restoreTexture();
  }

  const paletteEncoder = new GIF({ workers: 1, quality, width: 256, height: 256, workerScript: workerUrl, globalPalette: true });
  paletteEncoder.addFrame(paletteCanvas, { copy: true });
  await new Promise<void>((resolve) => {
    paletteEncoder.on('finished', () => resolve());
    paletteEncoder.render();
  });
  const palette = paletteEncoder.options.globalPalette;
  if (!Array.isArray(palette)) throw new Error('Could not create the GIF color palette');
  gif.setOption('globalPalette', palette);

  return new Promise((resolve) => {
    gif.on('finished', resolve);
    gif.render();
  });
}


function captureOptions(srcW: number, srcH: number, outW: number, outH: number, bg: string) {
  return {
    width: srcW,
    height: srcH,
    canvasWidth: outW,
    canvasHeight: outH,
    backgroundColor: bg,
    pixelRatio: 1,
    // a remote image node whose host refuses CORS can't be inlined; draw it
    // blank instead of failing the frame (embedded data: images always work)
    imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    // skip the transient overlays so the GIF is just the diagram
    filter: (node: HTMLElement) => {
      const cls = typeof node.className === 'string' ? node.className : '';
      return !(
        cls.includes('react-flow__minimap') ||
        cls.includes('react-flow__controls') ||
        cls.includes('react-flow__panel')
      );
    },
  };
}

export async function exportImage(element: HTMLElement, width: number): Promise<void> {
  const rect = element.getBoundingClientRect();
  const srcW = Math.round(rect.width);
  const srcH = Math.round(rect.height);
  if (srcW < 2 || srcH < 2) throw new Error('The diagram has no capture area');
  const bg = getComputedStyle(element).getPropertyValue('--mf-bg').trim() || '#ffffff';
  await document.fonts.ready;
  const restoreTexture = await preparePaperTexture(element);
  const restoreStyles = prepareSvgStyles(element);
  try {
    const canvas = await toCanvas(element, captureOptions(srcW, srcH, width, Math.max(1, Math.round(srcH * width / srcW)), bg));
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not encode PNG')), 'image/png'));
    download(blob, 'diagram.png');
  } finally {
    restoreStyles();
    restoreTexture();
  }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportGif(
  element: HTMLElement,
  diagram: Diagram,
  opts: Partial<GifOptions> = {},
  flow?: FlowCapture,
): Promise<void> {
  const blob = await captureGif(element, diagram, opts, flow);
  download(blob, gifFileName());
}
