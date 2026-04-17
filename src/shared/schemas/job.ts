import { z } from 'zod';

export const JobProviderSchema = z.enum(['elevenlabs', 'heygen', 'remotion']);
export const JobKindSchema = z.enum([
  'voice_train',
  'avatar_train',
  'tts',
  'avatar_video',
  'render',
]);
export const JobStatusSchema = z.enum(['queued', 'running', 'done', 'failed', 'canceled']);

export const JobSchema = z.object({
  id: z.number().int(),
  provider: JobProviderSchema,
  providerJobId: z.string().nullable(),
  kind: JobKindSchema,
  inputRef: z.string().nullable(),
  outputPath: z.string().nullable(),
  status: JobStatusSchema,
  lastPolledAt: z.number().int().nullable(),
  nextPollAt: z.number().int().nullable(),
  attempt: z.number().int().nonnegative(),
  error: z.string().nullable(),
  notifyOnComplete: z.boolean(),
  createdAt: z.number().int(),
});
export type Job = z.infer<typeof JobSchema>;
