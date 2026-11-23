// Scene to .pptx bytes. The only module that touches pptxgenjs, loaded on demand
// so the library stays out of the main bundle.

import type { Scene, SceneItem, Stroke, Text } from './scene.ts';

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const color = (value: string) => value.replace('#', '').toUpperCase();
const stroke = (line: Stroke | null) => (line ? { color: color(line.color), width: line.width, dashType: line.dash } : { type: 'none' as const });

export async function writePptx(scene: Scene, title = 'Marmerlade diagram'): Promise<Uint8Array> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = title;
  pptx.company = 'Marmerlade';
  const slide = pptx.addSlide();
  slide.background = { color: color(scene.background) };

  const type = (t: Text) => ({
    fontFace: t.font, fontSize: t.size, color: color(t.color), align: t.align, valign: t.valign, margin: 3, fit: 'none' as const,
  });
  const shapeType = (preset: string) => pptx.ShapeType[preset as keyof typeof pptx.ShapeType];

  for (const item of scene.items as SceneItem[]) {
    switch (item.kind) {
      case 'shape': {
        const base = {
          x: item.x, y: item.y, w: item.w, h: item.h, flipH: item.flipH, flipV: item.flipV, rectRadius: item.radius,
          fill: item.fill ? { color: color(item.fill), transparency: item.transparency } : { type: 'none' as const },
          line: stroke(item.line),
        };
        if (item.text) slide.addText(item.text.value, { ...base, shape: shapeType(item.preset), ...type(item.text) });
        else slide.addShape(shapeType(item.preset), base);
        break;
      }
      case 'text':
        slide.addText(item.text.value, { x: item.x, y: item.y, w: item.w, h: item.h, ...type(item.text) });
        break;
      case 'line':
        slide.addShape(pptx.ShapeType.line, {
          x: Math.min(item.x1, item.x2), y: Math.min(item.y1, item.y2), w: Math.abs(item.x2 - item.x1), h: Math.abs(item.y2 - item.y1),
          flipH: item.x2 < item.x1, flipV: item.y2 < item.y1,
          line: { ...stroke(item.line), beginArrowType: item.begin ? 'triangle' : 'none', endArrowType: item.end ? 'triangle' : 'none' },
        });
        break;
      case 'image':
        // pictures arrive as data: URIs; one that could not be loaded was dropped before this point
        if (item.src?.startsWith('data:')) slide.addImage({ data: item.src, x: item.x, y: item.y, w: item.w, h: item.h });
        break;
    }
  }
  return (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
}
