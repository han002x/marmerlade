import { z } from 'zod';
import { PRESETS } from './appearance.ts';
import type { Diagram, NodeImage } from './types.ts';

export const renderOptionsSchema = z.object({
  view: z.enum(['canvas', 'wiki', 'slides']).default('canvas'),
  id: z.string().min(1).optional(),
  nodeId: z.string().min(1).optional(),
  slide: z.number().int().positive().default(1),
  fold: z.enum(['current', 'expanded', 'collapsed']).default('current'),
  appearance: z.enum(PRESETS.map(preset => preset.id)).default('paper'),
  width: z.number().int().min(640).max(2400).default(1440),
  height: z.number().int().min(480).max(1800).default(1000),
});
export type RenderOptions = z.infer<typeof renderOptionsSchema>;
export const gifOptionsSchema = z.object({
  fps: z.number().int().min(1).max(24).default(12),
  maxWidth: z.number().int().min(320).max(1600).default(900),
  flow: z.boolean().default(false),
});
export type RenderGifOptions = z.infer<typeof gifOptionsSchema>;
export const previewRequestSchema = renderOptionsSchema.extend({ revision: z.number().int().nonnegative() });
export const gifRequestSchema = previewRequestSchema.extend(gifOptionsSchema.shape);

export interface RenderBridge {
  fit(): Promise<void>;
  diagram(): Diagram;
  measure(): Array<{ id: string; x: number; y: number; width: number; height: number }>;
  layout(direction: 'TB' | 'LR'): Diagram;
  importImage(base64: string, name: string, mime: string): Promise<NodeImage>;
  gif(options: RenderGifOptions): Promise<string>;
}
declare global {
  interface Window {
    __marmerladeRender?: boolean;
    __marmerladeProgress?: { frame: number; total: number };
    marmerladeRenderer?: RenderBridge;
  }
}
