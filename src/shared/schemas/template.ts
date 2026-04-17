import { z } from 'zod';

export const TemplateValiditySchema = z.union([z.literal('valid'), z.string().regex(/^invalid-/)]);

// In-memory shape; templates themselves are .tsx files not persisted as rows.
// The concrete Zod `schema` and React `Composition` live on the template
// object loaded by `src/main/services/templateLoader.ts` and are not part of
// this serialisable summary.
export const TemplateSummarySchema = z.object({
  id: z.string(),
  sourcePath: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  fps: z.number().int().positive(),
  validity: TemplateValiditySchema,
  isCustom: z.boolean(),
});
export type TemplateSummary = z.infer<typeof TemplateSummarySchema>;
