import { z } from 'zod';

export const TakeSourceSchema = z.enum(['record', 'import']);
export const TakeMarkSchema = z.enum(['good', 'bad', 'unmarked']);

export const TakeSchema = z.object({
  id: z.number().int(),
  path: z.string(),
  source: TakeSourceSchema,
  durationSeconds: z.number().int().nonnegative(),
  trimStartMs: z.number().int().nonnegative(),
  trimEndMs: z.number().int().nonnegative(),
  mark: TakeMarkSchema,
  createdAt: z.number().int(),
});
export type Take = z.infer<typeof TakeSchema>;
