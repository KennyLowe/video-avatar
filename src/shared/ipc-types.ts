import type { Project, ProjectSummary } from './schemas/project.js';
import type { AppSettings } from './schemas/settings.js';
import type { ClaudeVerifyResult } from './schemas/claudeCode.js';
import type { Script, ScriptResponse } from './schemas/script.js';
import type { GenerationMode } from './schemas/render.js';
import type { Voice, VoiceTier } from './schemas/voice.js';
import type { Take } from './schemas/take.js';
import type { Avatar, AvatarTier } from './schemas/avatar.js';
import type { Segment } from './schemas/segment.js';
import type { Job } from './schemas/job.js';
import type { ProviderErrorShape } from './errors.js';

// Shape of the bridge exposed at window.lumo. Types live in shared/ so both
// main and renderer compile against the same source of truth.

export interface CostPreview {
  elevenlabs: { characters: number; credits: number; usd: number };
  heygen: { seconds: number; credits: number; usd: number };
  totalUsd: number;
  mtdUsd: { elevenlabs: number; heygen: number };
}

export interface StockVoice {
  voiceId: string;
  name: string;
  preview: string | null;
}

export interface StockAvatar {
  avatarId: string;
  name: string;
  tier: 'photo' | 'instant';
}

export type ScriptTone = 'conversational' | 'technical' | 'formal';

export type AssistAction =
  | 'tighten'
  | 'less-corporate'
  | 'break-into-chapters'
  | 'add-hook'
  | 'convert-jargon';

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
    test: (input: {
      provider: 'elevenlabs' | 'heygen';
      key: string;
    }) => Promise<IpcEnvelope<{ plan: string; mtdCredits: number | null }>>;
    set: (input: { provider: 'elevenlabs' | 'heygen'; key: string }) => Promise<IpcEnvelope<void>>;
    clear: (input: { provider: 'elevenlabs' | 'heygen' }) => Promise<IpcEnvelope<void>>;
  };
  scripts: {
    list: (input: { slug: string }) => Promise<IpcEnvelope<Script[]>>;
    generate: (input: {
      prompt: string;
      tone: ScriptTone;
      targetDurationSeconds: number;
    }) => Promise<IpcEnvelope<ScriptResponse>>;
    save: (input: {
      slug: string;
      id: number | null;
      title: string;
      bodyMd: string;
      estimatedSeconds: number;
    }) => Promise<IpcEnvelope<Script>>;
    restore: (input: { slug: string; versionId: number }) => Promise<IpcEnvelope<Script>>;
    assist: (input: {
      action: AssistAction;
      selection: string;
    }) => Promise<IpcEnvelope<{ replacement: string }>>;
  };
  generate: {
    costPreview: (input: {
      slug: string;
      scriptId: number;
      mode: GenerationMode;
    }) => Promise<IpcEnvelope<CostPreview>>;
    run: (input: {
      slug: string;
      scriptId: number;
      voiceId: string;
      voiceRowId: number | null;
      avatarId: string;
      avatarRowId: number | null;
      mode: GenerationMode;
    }) => Promise<IpcEnvelope<{ jobId: number }>>;
  };
  voices: {
    listStock: () => Promise<IpcEnvelope<StockVoice[]>>;
    list: (input: { slug: string }) => Promise<IpcEnvelope<Voice[]>>;
    listTakes: (input: {
      slug: string;
    }) => Promise<IpcEnvelope<{ takes: Take[]; goodSeconds: number }>>;
    saveRecording: (input: {
      slug: string;
      bytesBase64: string;
      sourceExtension: string;
    }) => Promise<IpcEnvelope<Take>>;
    importFile: (input: { slug: string; sourcePath: string }) => Promise<IpcEnvelope<Take>>;
    markTake: (input: {
      slug: string;
      takeId: number;
      mark: 'good' | 'bad' | 'unmarked';
    }) => Promise<IpcEnvelope<Take>>;
    trimTake: (input: {
      slug: string;
      takeId: number;
      inMs: number;
      outMs: number;
    }) => Promise<IpcEnvelope<Take>>;
    deleteTake: (input: { slug: string; takeId: number }) => Promise<IpcEnvelope<void>>;
    minimums: () => Promise<IpcEnvelope<{ pvcSeconds: number; ivcSeconds: number }>>;
    train: (input: {
      slug: string;
      name: string;
      tier: VoiceTier;
    }) => Promise<IpcEnvelope<{ voice: Voice; job: Job }>>;
    preview: (input: {
      slug: string;
      voiceId: string;
      text: string;
    }) => Promise<IpcEnvelope<{ mp3Path: string }>>;
  };
  avatars: {
    listStock: () => Promise<IpcEnvelope<StockAvatar[]>>;
    list: (input: { slug: string }) => Promise<IpcEnvelope<Avatar[]>>;
    listSegments: (input: { slug: string }) => Promise<IpcEnvelope<Segment[]>>;
    probeVideo: (input: { sourcePath: string }) => Promise<IpcEnvelope<VideoProbePayload>>;
    probeImage: (input: { sourcePath: string }) => Promise<IpcEnvelope<ImageProbePayload>>;
    importVideo: (input: {
      slug: string;
      sourcePath: string;
    }) => Promise<IpcEnvelope<{ path: string; probe: VideoProbePayload }>>;
    importImage: (input: {
      slug: string;
      sourcePath: string;
    }) => Promise<IpcEnvelope<{ path: string; probe: ImageProbePayload }>>;
    grabFrame: (input: {
      slug: string;
      sourcePath: string;
      atSeconds: number;
    }) => Promise<IpcEnvelope<{ path: string; probe: ImageProbePayload }>>;
    addSegment: (input: {
      slug: string;
      sourcePath: string;
      inMs: number;
      outMs: number;
    }) => Promise<IpcEnvelope<Segment>>;
    trainPhoto: (input: {
      slug: string;
      imagePath: string;
      name: string;
    }) => Promise<IpcEnvelope<{ avatar: Avatar; job: Job }>>;
    trainInstant: (input: {
      slug: string;
      segmentIds: number[];
      name: string;
    }) => Promise<IpcEnvelope<{ avatar: Avatar; job: Job }>>;
  };
}

export interface VideoProbePayload {
  durationSeconds: number;
  widthPx: number;
  heightPx: number;
  fps: number;
  codec: string;
  sizeBytes: number;
}

export interface ImageProbePayload {
  widthPx: number;
  heightPx: number;
  codec: string;
  sizeBytes: number;
}

export type { AvatarTier };

export type IpcSuccess<T> = { ok: true; value: T };
export type IpcFailure = { ok: false; error: ProviderErrorShape };
export type IpcEnvelope<T> = IpcSuccess<T> | IpcFailure;
