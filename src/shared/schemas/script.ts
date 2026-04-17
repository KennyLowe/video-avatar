import { z } from 'zod';

// The schema Claude Code must match. Referenced from services/scriptPrompt.ts
// and from the script-studio IPC handler (arrives in US1).
export const ScriptResponseSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  estimatedDurationSeconds: z.number().int().positive(),
  chapters: z
    .array(z.object({ title: z.string().min(1), startLine: z.number().int().nonnegative() }))
    .optional(),
});
export type ScriptResponse = z.infer<typeof ScriptResponseSchema>;

export const ScriptSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  bodyMd: z.string(),
  wordCount: z.number().int().nonnegative(),
  estimatedSeconds: z.number().int().nonnegative(),
  parentVersionId: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Script = z.infer<typeof ScriptSchema>;
