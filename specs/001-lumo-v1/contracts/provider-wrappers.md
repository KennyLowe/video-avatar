# Contract: Provider wrappers

Lumo has **one typed wrapper per external provider**. Every other module calls
into these wrappers; no UI component, no renderer, no worker, ever makes a raw
`fetch()` against a provider. This contract defines the operations each wrapper
MUST expose.

All wrappers share these cross-cutting rules:
- **Credentials are fetched at call time** via `keytar`. Never cached in a
  module-level variable.
- **Errors** reject with an `Error` whose `.message` is the provider's verbatim
  message and `.cause` carries the raw response. No wrapper swallows.
- **Logging** is structured JSONL; request and response bodies are passed
  through a redactor before write.
- **Timeouts** are configurable per call with a sensible default; abort signals
  plumb through.
- **No retry** at the wrapper layer. Retries belong to the job worker.

## `src/providers/claudeCode.ts`

The one wrapper for the Claude Code CLI subprocess.

```ts
export interface ClaudeInvokeOptions {
  model?: string;              // defaults to the app-global default, which defaults to 'claude-opus-4-7'
  systemPrompt?: string;
  prompt: string;
  outputFormat: 'json' | 'text';
  timeoutMs?: number;          // default 120000
  signal?: AbortSignal;
}

export interface ClaudeInvokeResult<T = unknown> {
  raw: string;                 // raw stdout
  parsed: T;                   // when outputFormat === 'json'
  durationMs: number;
  stderr: string;              // captured and logged, never thrown
}

export async function invoke<T = unknown>(opts: ClaudeInvokeOptions): Promise<ClaudeInvokeResult<T>>;
export async function verifyInstalled(): Promise<{ version: string; authenticated: boolean }>;
```

**Invariants**
- The subprocess contract is exactly `claude --print --output-format <format> --model <model>`.
- Any prompt over 4 KB is passed via stdin, not argv.
- `outputFormat: 'json'` parses stdout with `JSON.parse` and throws with a
  descriptive message if parse fails.
- `signal.abort()` kills the subprocess (SIGTERM, escalating to SIGKILL after
  a grace period).

## `src/providers/elevenlabs.ts`

```ts
export async function testKey(): Promise<{ plan: string; mtdCredits: number | null }>;

export interface PvcSubmission { name: string; files: readonly string[]; }
export async function createPVC(sub: PvcSubmission): Promise<{ voiceId: string }>;

export interface IvcSubmission { name: string; files: readonly string[]; }
export async function createIVC(sub: IvcSubmission): Promise<{ voiceId: string }>;

export async function getVoiceStatus(voiceId: string): Promise<'training' | 'ready' | 'failed'>;

export interface TtsOptions {
  voiceId: string;
  text: string;
  modelId?: string;            // provider model, e.g. 'eleven_multilingual_v2'
  voiceSettings?: { stability: number; similarityBoost: number; style?: number };
  signal?: AbortSignal;
}
export async function tts(opts: TtsOptions): Promise<{ mp3: Buffer; characters: number }>;

export async function getPvcMinimumSeconds(): Promise<number>;
export async function getIvcMinimumSeconds(): Promise<number>;
```

**Invariants**
- Every function resolves the API key from `keytar.getPassword('Lumo/elevenlabs', 'default')` at call time.
- `getPvcMinimumSeconds` and `getIvcMinimumSeconds` query the provider (or a documented default if the endpoint is unavailable) and cache for the current session only.

## `src/providers/heygen.ts`

```ts
export async function testKey(): Promise<{ plan: string; mtdCredits: number | null }>;

export interface PhotoAvatarSubmission { imagePath: string; name: string; }
export async function createPhotoAvatar(s: PhotoAvatarSubmission): Promise<{ avatarId: string; jobId?: string }>;

export interface InstantAvatarSubmission { segmentPaths: readonly string[]; name: string; }
export async function createInstantAvatar(s: InstantAvatarSubmission): Promise<{ avatarId: string; jobId?: string }>;

export async function getAvatarStatus(avatarIdOrJobId: string): Promise<'training' | 'ready' | 'failed'>;

export type GenerationMode = 'standard' | 'avatar_iv';
export interface GenerateVideoSubmission {
  avatarId: string;
  audioSource: { kind: 'url'; url: string } | { kind: 'asset'; assetId: string };
  mode: GenerationMode;
  dimensions: { width: number; height: number };
  background?: { kind: 'color'; value: string } | { kind: 'transparent' };
}
export async function generateVideo(s: GenerateVideoSubmission): Promise<{ videoJobId: string }>;

export async function getVideoStatus(videoJobId: string): Promise<
  | { status: 'pending' | 'processing' }
  | { status: 'completed'; videoUrl: string }
  | { status: 'failed'; error: string }
>;

export async function cancelVideo(videoJobId: string): Promise<void>;

// Optional, enabled only if current API supports it (determined at research time):
export async function uploadAudioAsset?(path: string): Promise<{ assetId: string }>;
```

**Invariants**
- `generateVideo` validates `mode` against `avatar.tier` compatibility (derived from HeyGen capabilities discovered during research). Callers see a domain `IncompatibleModeError` before a request is sent.
- `getVideoStatus` returns the provider's raw status strings mapped into the closed set above; unknown values propagate as `{ status: 'failed', error: ... }`.
- If `uploadAudioAsset` is undefined at runtime, the pipeline falls through to the configured transport (S3/R2/cloudflared).

## `src/providers/remotion.ts`

Thin wrapper around `@remotion/renderer` + `@remotion/bundler`. Lumo owns the
bundle URL lifetime.

```ts
export async function bundleOnce(entryTsx: string): Promise<string>; // returns serveUrl
export async function invalidateBundle(): Promise<void>;

export interface RenderRequest {
  serveUrl: string;
  compositionId: string;
  inputProps: unknown;        // validated by the template's Zod schema before this is called
  outputPath: string;
  codec: 'h264' | 'h265';
  imageFormat: 'jpeg' | 'png';
  jpegQuality?: number;
  crf?: number;
  audioCodec: 'aac';
  audioBitrate: string;        // e.g. '192k'
  onProgress?: (p: { renderedFrames: number; totalFrames: number; stitchStage?: string }) => void;
  signal?: AbortSignal;
}
export async function renderMedia(r: RenderRequest): Promise<{ durationSeconds: number }>;
```

**Invariants**
- `inputProps` is always the output of `template.schema.parse(...)`; callers
  MUST NOT pass unvalidated data.
- No `eval`, no dynamic `require` of generated paths. Template modules are
  loaded only from the app bundle directory and `<project>/templates/`.

## `src/providers/transport.ts`

The audio-upload transport abstraction.

```ts
export type TransportKind = 's3' | 'r2' | 'cloudflared' | 'direct';

export interface Transport {
  readonly kind: TransportKind;
  isAvailable(): Promise<boolean>;
  /** Makes the local file reachable by HeyGen. Returns a URL or an assetId. */
  put(localPath: string, hint?: { suggestedName?: string }): Promise<
    | { kind: 'url'; url: string; cleanup?: () => Promise<void> }
    | { kind: 'asset'; assetId: string }
  >;
}

export function resolve(project: { uploadTransport?: TransportKind }): Transport;
```

**Invariants**
- `resolve` picks in order: per-project override → app default → first available among `['s3','r2','direct','cloudflared']`.
- `direct` is only returned if `heygen.uploadAudioAsset` exists at runtime.
- Every `cleanup` returned MUST be invoked after HeyGen either confirms pickup
  or terminally fails.
