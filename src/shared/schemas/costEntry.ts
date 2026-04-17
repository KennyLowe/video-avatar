import { z } from 'zod';

export const CostOperationSchema = z.enum([
  'tts',
  'pvc_train',
  'ivc_train',
  'avatar_train',
  'avatar_video_standard',
  'avatar_video_iv',
]);

export const CostUnitKindSchema = z.enum(['characters', 'credits', 'seconds', 'minutes']);

export const CostEntrySchema = z.object({
  id: z.number().int(),
  jobId: z.number().int().nullable(),
  provider: z.enum(['elevenlabs', 'heygen']),
  operation: CostOperationSchema,
  units: z.number().int().nonnegative(),
  unitKind: CostUnitKindSchema,
  usdEstimate: z.number().nonnegative(),
  recordedAt: z.number().int(),
});
export type CostEntry = z.infer<typeof CostEntrySchema>;
