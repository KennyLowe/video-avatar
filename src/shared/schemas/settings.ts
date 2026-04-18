import { z } from 'zod';
import { TransportKindSchema } from './project.js';

export const LogLevelSchema = z.enum(['info', 'debug', 'trace']);
export const AppearanceSchema = z.enum(['light', 'dark', 'system']);

export const ResolutionSchema = z.enum(['1080p30', '1080p60', '4k30']);
export const RenderCodecSchema = z.enum(['h264', 'h265']);
export const RenderPresetSchema = z.enum(['fast', 'balanced', 'quality']);

export const RenderDefaultsSchema = z.object({
  resolution: ResolutionSchema,
  codec: RenderCodecSchema,
  preset: RenderPresetSchema,
  audioBitrate: z.string(),
});
export type RenderDefaults = z.infer<typeof RenderDefaultsSchema>;

export const S3ConfigSchema = z.object({
  endpoint: z.string().optional(),
  region: z.string().min(1),
  bucket: z.string().min(1),
  prefix: z.string().optional(),
  /** Pre-signed URL TTL in seconds. Capped at 3600 (1h) by AWS/R2. */
  presignTtlSeconds: z.number().int().positive().max(3600),
});
export type S3Config = z.infer<typeof S3ConfigSchema>;

export const CloudflaredConfigSchema = z.object({
  /** Absolute path to `cloudflared` binary. Default resolves on PATH. */
  binaryPath: z.string().optional(),
  /** Local port to bind the ephemeral HTTP server to. 0 = pick any. */
  port: z.number().int().nonnegative().max(65_535),
});
export type CloudflaredConfig = z.infer<typeof CloudflaredConfigSchema>;

export const AppSettingsSchema = z.object({
  projectsRoot: z.string().nullable(),
  defaultClaudeModel: z.string().min(1),
  defaultClaudeTemperature: z.number().min(0).max(1).optional(),
  claudeModelOverrides: z.array(z.string()).default([]),
  defaultUploadTransport: TransportKindSchema,
  s3Config: S3ConfigSchema.nullable(),
  cloudflaredConfig: CloudflaredConfigSchema.nullable(),
  renderDefaults: RenderDefaultsSchema,
  logLevel: LogLevelSchema,
  logRetentionDays: z.number().int().positive(),
  appearance: AppearanceSchema,
  compactDensity: z.boolean(),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  projectsRoot: null,
  defaultClaudeModel: 'claude-opus-4-7',
  claudeModelOverrides: [],
  defaultUploadTransport: 'heygen',
  s3Config: null,
  cloudflaredConfig: null,
  renderDefaults: {
    resolution: '1080p30',
    codec: 'h264',
    preset: 'balanced',
    audioBitrate: '192k',
  },
  logLevel: 'info',
  logRetentionDays: 14,
  appearance: 'system',
  compactDensity: false,
};
