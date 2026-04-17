import type { Project, ProjectSummary } from './schemas/project.js';
import type { AppSettings } from './schemas/settings.js';
import type { ClaudeVerifyResult } from './schemas/claudeCode.js';
import type { ProviderErrorShape } from './errors.js';

// Shape of the bridge exposed at window.lumo. Types live in shared/ so both
// main and renderer compile against the same source of truth.

export interface LumoBridge {
  projects: {
    list: () => Promise<IpcEnvelope<ProjectSummary[]>>;
    create: (input: { name: string }) => Promise<IpcEnvelope<Project>>;
    open: (input: { slug: string }) => Promise<IpcEnvelope<Project>>;
  };
  settings: {
    get: () => Promise<IpcEnvelope<AppSettings>>;
    update: (patch: Partial<AppSettings>) => Promise<IpcEnvelope<AppSettings>>;
    pickProjectsRoot: () => Promise<IpcEnvelope<string | null>>;
  };
  credentials: {
    status: () => Promise<
      IpcEnvelope<{
        elevenlabs: boolean;
        heygen: boolean;
        s3: boolean;
        claudeCode: ClaudeVerifyResult;
      }>
    >;
    recheckClaudeCode: () => Promise<IpcEnvelope<ClaudeVerifyResult>>;
  };
}

export type IpcSuccess<T> = { ok: true; value: T };
export type IpcFailure = { ok: false; error: ProviderErrorShape };
export type IpcEnvelope<T> = IpcSuccess<T> | IpcFailure;
