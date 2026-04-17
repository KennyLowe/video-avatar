import { z } from 'zod';

export const VoiceTierSchema = z.enum(['pvc', 'ivc']);
export type VoiceTier = z.infer<typeof VoiceTierSchema>;

export const VoiceStatusSchema = z.enum(['training', 'ready', 'failed', 'canceled']);
export type VoiceStatus = z.infer<typeof VoiceStatusSchema>;

export const VoiceSchema = z.object({
  id: z.number().int(),
  provider: z.literal('elevenlabs'),
  providerVoiceId: z.string().nullable(),
  tier: VoiceTierSchema,
  name: z.string(),
  sampleSeconds: z.number().int().nonnegative(),
  jobId: z.number().int().nullable(),
  status: VoiceStatusSchema,
  createdAt: z.number().int(),
});
export type Voice = z.infer<typeof VoiceSchema>;
