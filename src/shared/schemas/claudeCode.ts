import { z } from 'zod';

export const ClaudeInstallStatusSchema = z.enum(['installed', 'missing']);
export const ClaudeAuthStatusSchema = z.enum(['authenticated', 'unauthenticated', 'unknown']);

export const ClaudeVerifyResultSchema = z.object({
  installed: z.boolean(),
  authenticated: z.boolean(),
  version: z.string().optional(),
  reason: z.string().optional(),
});
export type ClaudeVerifyResult = z.infer<typeof ClaudeVerifyResultSchema>;
