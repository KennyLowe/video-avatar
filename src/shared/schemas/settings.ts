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

export const AppSettingsSchema = z.object({
  projectsRoot: z.string().nullable(),
  defaultClaudeModel: z.string().min(1),
  defaultClaudeTemperature: z.number().min(0).max(1).optional(),
  claudeModelOverrides: z.array(z.string()).default([]),
  defaultUploadTransport: TransportKindSchema,
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
