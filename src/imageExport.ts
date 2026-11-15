import { toPng, toSvg } from 'html-to-image';
import { preparePaperTexture, prepareSvgStyles } from './gifCapture';

export async function exportImage(element: HTMLElement, format: 'svg' | 'png') {
  await document.fonts.ready;
  const restorePaper = await preparePaperTexture(element);
  const restoreSvg = prepareSvgStyles(element);
  try {
    const options = {
      backgroundColor: getComputedStyle(element).getPropertyValue('--mf-bg').trim() || '#ffffff',
      pixelRatio: 2,
      filter: (node: HTMLElement) => !['react-flow__minimap', 'react-flow__controls', 'react-flow__panel', 'react-flow__node-toolbar', 'react-flow__handle'].some(name => node.classList?.contains(name)),
    };
    const url = await (format === 'png' ? toPng(element, options) : toSvg(element, options));
    const link = document.createElement('a'); link.href = url; link.download = `diagram.${format}`; link.click();
  } finally { restoreSvg(); restorePaper(); }
}
