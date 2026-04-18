import { z } from 'zod';

export const RenderKindSchema = z.enum(['avatar_clip', 'composed']);
export type RenderKind = z.infer<typeof RenderKindSchema>;

export const GenerationModeSchema = z.enum(['standard', 'avatar_iv']);
export type GenerationMode = z.infer<typeof GenerationModeSchema>;

export const RenderStatusSchema = z.enum(['pending', 'running', 'done', 'failed', 'canceled']);
export type RenderStatus = z.infer<typeof RenderStatusSchema>;

export const RenderSchema = z.object({
  id: z.number().int(),
  kind: RenderKindSchema,
  scriptId: z.number().int().nullable(),
  voiceId: z.number().int().nullable(),
  avatarId: z.number().int().nullable(),
  generationMode: GenerationModeSchema.nullable(),
  templateId: z.string().nullable(),
  propsJson: z.string().nullable(),
  outputPath: z.string(),
  status: RenderStatusSchema,
  createdAt: z.number().int(),
});
export type Render = z.infer<typeof RenderSchema>;
