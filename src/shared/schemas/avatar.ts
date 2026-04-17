import { z } from 'zod';

export const AvatarTierSchema = z.enum(['photo', 'instant']);
export type AvatarTier = z.infer<typeof AvatarTierSchema>;

export const AvatarStatusSchema = z.enum(['training', 'ready', 'failed', 'canceled']);
export type AvatarStatus = z.infer<typeof AvatarStatusSchema>;

export const AvatarSchema = z.object({
  id: z.number().int(),
  provider: z.literal('heygen'),
  providerAvatarId: z.string().nullable(),
  tier: AvatarTierSchema,
  sourceRef: z.string(),
  jobId: z.number().int().nullable(),
  status: AvatarStatusSchema,
  createdAt: z.number().int(),
});
export type Avatar = z.infer<typeof AvatarSchema>;
