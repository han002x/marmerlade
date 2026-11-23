// Browser side of the PowerPoint export: the live palette, rendered node sizes,
// and pictures turned into PNG data URIs so every one lands in the file.

import { FONTS } from '../appearance.ts';
import { download } from '../gif.ts';
import { ICON_BY_ID } from '../icons/catalog.ts';
import { activeAppearance } from '../theme.ts';
import type { DiagramEdge, DiagramNode } from '../types.ts';
import { buildScene, pictureScene, type Palette, type Scene } from './scene.ts';
import { PPTX_MIME, writePptx } from './write.ts';

const MAX_PICTURE = 512;
const FILE = 'diagram.pptx';

export function currentPalette(): Palette {
  const a = activeAppearance();
  const { bg, ink, node, group, text, border } = a.colors;
  const font = FONTS[a.contentFont].split(',')[0].replace(/['"]/g, '').trim();
  return { bg, ink, node, group, text, border, font };
}

/** Rendered node sizes in canvas px. Layout sizes, so neither canvas zoom nor workspace zoom changes them. */
export function measuredSizes(): Record<string, { width: number; height: number }> {
  const sizes: Record<string, { width: number; height: number }> = {};
  for (const el of document.querySelectorAll<HTMLElement>('.react-flow__node-diagram')) {
    if (el.dataset.id && el.offsetWidth > 0 && el.offsetHeight > 0) sizes[el.dataset.id] = { width: el.offsetWidth, height: el.offsetHeight };
  }
  return sizes;
}

/** `src` as a PNG data URI, or null when it cannot be loaded or read back (e.g. a host without CORS). */
async function toPng(src: string): Promise<string | null> {
  if (/^data:image\/(png|jpeg|gif);/.test(src)) return src;
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = src;
  try {
    await image.decode();
    const k = Math.min(1, MAX_PICTURE / Math.max(image.naturalWidth, image.naturalHeight, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((image.naturalWidth || MAX_PICTURE) * k));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || MAX_PICTURE) * k));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function iconSvg(id: string, color: string): string | null {
  const entry = ICON_BY_ID.get(id);
  if (!entry) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="256" height="256" style="color:${color}">${entry.body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Load every picture; one that cannot be read is left out, as the PNG export blanks it. */
export async function resolvePictures(scene: Scene): Promise<Scene> {
  const items = await Promise.all(scene.items.map(async (item) => {
    if (item.kind !== 'image') return item;
    const source = item.icon ? iconSvg(item.icon, item.color ?? '#000000') : item.src;
    const src = source ? await toPng(source) : null;
    return src ? { ...item, src } : null;
  }));
  return { ...scene, items: items.filter((i) => i !== null) };
}

const blob = (bytes: Uint8Array<ArrayBufferLike>) => new Blob([bytes as BlobPart], { type: PPTX_MIME });

/** The shown flowchart as editable shapes. */
export async function diagramPptx(nodes: DiagramNode[], edges: DiagramEdge[]): Promise<Uint8Array> {
  const scene = buildScene({ nodes, edges, sizes: measuredSizes(), palette: currentPalette() });
  return writePptx(await resolvePictures(scene));
}

export async function exportDiagramPptx(nodes: DiagramNode[], edges: DiagramEdge[]) {
  download(blob(await diagramPptx(nodes, edges)), FILE);
}

/** A picture of a diagram that has no editable form (a sequence diagram). */
export async function exportPicturePptx(png: Blob, width: number, height: number) {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the picture'));
    reader.readAsDataURL(png);
  });
  download(blob(await writePptx(pictureScene(src, width, height, currentPalette().bg))), FILE);
}
