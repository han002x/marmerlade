import { z } from 'zod';
import { diagramSchema } from './workspaceSchema.ts';

export const briefInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  audience: z.string().trim().min(1).max(1000),
  goal: z.string().trim().min(1).max(2000),
  workflow: z.string().trim().min(1).max(4000),
  source: z.string().min(1).max(100_000),
  evidence: z.array(z.object({ path: z.string().min(1), line: z.number().int().positive(), note: z.string().trim().min(1).max(2000) })).min(1).max(100),
  assumptions: z.array(z.string().trim().min(1).max(2000)).max(100),
  outputs: z.array(z.enum(['mermaid', 'svg', 'png', 'gif'])).min(1),
});
const common = {
  id: z.string().min(1), basedOn: z.number().int().nonnegative(), repository: z.string(),
  content: briefInputSchema, diagram: diagramSchema,
};
export const briefSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('draft') }),
  z.object({ ...common, kind: z.literal('changes_requested'), feedback: z.string().min(1) }),
  z.object({ ...common, kind: z.literal('generated'), approvedAt: z.string(), generatedRevision: z.number().int().positive() }),
]);
export const briefStatusSchema = z.object({ brief: briefSchema.nullable(), revision: z.number().int().nonnegative(), nodeCount: z.number().int().nonnegative() });
export const reviewSchema = z.discriminatedUnion('action', [
  z.object({ id: z.string().min(1), action: z.literal('approve') }),
  z.object({ id: z.string().min(1), action: z.literal('request_changes'), feedback: z.string().trim().min(1).max(4000) }),
]);
export type BriefInput = z.infer<typeof briefInputSchema>;
export type Brief = z.infer<typeof briefSchema>;
export type BriefReview = z.infer<typeof reviewSchema>;
