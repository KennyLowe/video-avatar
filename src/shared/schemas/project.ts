import { z } from 'zod';

export const TransportKindSchema = z.enum(['heygen', 's3', 'r2', 'cloudflared']);
export type TransportKind = z.infer<typeof TransportKindSchema>;

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'slug must be kebab-case, 1–64 chars'),
  createdAt: z.string().datetime(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'brandColor must be a 7-char hex literal')
    .optional(),
  logoPath: z.string().optional(),
  defaultVoiceId: z.number().int().nullable(),
  defaultAvatarId: z.number().int().nullable(),
  uploadTransport: TransportKindSchema.optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectSummarySchema = ProjectSchema.pick({
  id: true,
  name: true,
  slug: true,
  createdAt: true,
}).extend({
  projectPath: z.string(),
  lastModifiedAt: z.string().datetime().nullable(),
  lastRenderThumbnail: z.string().nullable(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
