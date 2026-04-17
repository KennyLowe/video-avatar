# Contract: IPC bridge (main ↔ renderer)

Electron process boundary. Renderer (React UI) calls into main via a typed
`window.lumo.*` bridge exposed from a preload script. No direct Node access
from the renderer.

All IPC calls are promise-based. Errors surface with `.code`, `.message`, and
optional `.provider`. No IPC handler ever throws raw Node errors across the
boundary.

## Channels

### `projects.*`

```ts
projects.list(): Promise<ProjectSummary[]>;
projects.create(input: { name: string; projectsRoot: string }): Promise<Project>;
projects.open(id: string): Promise<Project>;
projects.rename(id: string, newName: string): Promise<Project>;
projects.duplicate(id: string): Promise<Project>;
projects.delete(id: string): Promise<{ recycled: true }>;
projects.revealInExplorer(id: string): Promise<void>;
```

### `credentials.*`

```ts
credentials.status(): Promise<{
  elevenlabs: boolean;
  heygen: boolean;
  s3: boolean;
  claudeCode: { installed: boolean; authenticated: boolean; version?: string };
}>;
credentials.test(provider: 'elevenlabs' | 'heygen'): Promise<{ plan: string; mtdCredits: number | null }>;
credentials.set(provider: 'elevenlabs' | 'heygen', key: string): Promise<void>;
credentials.clear(provider: 'elevenlabs' | 'heygen'): Promise<void>;
credentials.recheckClaudeCode(): Promise<{ installed: boolean; authenticated: boolean; version?: string }>;
```

### `voices.*`

```ts
voices.list(projectId: string): Promise<Voice[]>;
voices.takes(projectId: string): Promise<Take[]>;
voices.recordStart(projectId: string, deviceId: string): Promise<{ takeId: number; path: string }>;
voices.recordStop(takeId: number): Promise<Take>;
voices.import(projectId: string, sourcePaths: readonly string[]): Promise<Take[]>;
voices.markTake(takeId: number, mark: 'good' | 'bad' | 'unmarked'): Promise<Take>;
voices.trimTake(takeId: number, inMs: number, outMs: number): Promise<Take>;
voices.deleteTake(takeId: number): Promise<void>;
voices.trainPVC(projectId: string, name: string): Promise<{ jobId: number; voiceId: number }>;
voices.trainIVC(projectId: string, name: string): Promise<{ jobId: number; voiceId: number }>;
voices.preview(voiceId: number, text: string): Promise<{ mp3Path: string }>;
voices.minimums(): Promise<{ pvcSeconds: number; ivcSeconds: number }>;
```

### `avatars.*`

```ts
avatars.list(projectId: string): Promise<Avatar[]>;
avatars.importVideo(projectId: string, sourcePaths: readonly string[]): Promise<VideoProbe[]>;
avatars.importImage(projectId: string, sourcePaths: readonly string[]): Promise<ImageProbe[]>;
avatars.addSegment(projectId: string, sourcePath: string, inMs: number, outMs: number): Promise<Segment>;
avatars.trainPhoto(projectId: string, imagePath: string, name: string): Promise<{ jobId: number; avatarId: number }>;
avatars.trainInstant(projectId: string, segmentIds: readonly number[], name: string): Promise<{ jobId: number; avatarId: number }>;
avatars.preview(avatarId: number): Promise<{ videoPath: string }>;
```

### `scripts.*`

```ts
scripts.list(projectId: string): Promise<Script[]>;
scripts.generate(projectId: string, input: {
  prompt: string;
  tone: 'conversational' | 'technical' | 'formal';
  targetLengthSeconds: number;
  template?: 'explainer' | 'demo' | 'announcement' | 'internal' | 'custom';
}): Promise<Script>;
scripts.save(projectId: string, id: number | null, bodyMd: string, title: string): Promise<Script>;
scripts.restore(projectId: string, versionId: number): Promise<Script>;
scripts.assist(projectId: string, id: number, selection: string, action:
  'tighten' | 'less-corporate' | 'break-into-chapters' | 'add-hook' | 'convert-jargon'
): Promise<{ replacement: string }>;
```

### `generate.*` (avatar video)

```ts
generate.costPreview(projectId: string, input: {
  scriptId: number; voiceId: number; avatarId: number; mode: 'standard' | 'avatar_iv';
}): Promise<{
  elevenlabs: { characters: number; credits: number; usd: number };
  heygen: { minutes: number; credits: number; usd: number };
  totalUsd: number;
  mtdUsd: { elevenlabs: number; heygen: number };
  headroom: { elevenlabs: number | null; heygen: number | null };
}>;
generate.run(projectId: string, input: {
  scriptId: number; voiceId: number; avatarId: number; mode: 'standard' | 'avatar_iv';
}): Promise<{ jobId: number }>;
generate.approve(renderId: number): Promise<void>;
```

### `compose.*` (Remotion)

```ts
compose.listTemplates(projectId: string): Promise<Template[]>;
compose.promptProps(projectId: string, input: {
  templateId: string;
  prompt: string;
  startingProps?: unknown;
}): Promise<{ props: unknown; warnings: string[] }>;
compose.render(projectId: string, input: {
  templateId: string;
  props: unknown;
  settings: { resolution: '1080p30' | '1080p60' | '4k30'; codec: 'h264' | 'h265'; preset: 'fast' | 'balanced' | 'quality'; audioBitrate: string };
}): Promise<{ jobId: number }>;
```

### `jobs.*`

```ts
jobs.listActive(projectId: string): Promise<Job[]>;
jobs.listHistory(projectId: string, since?: number): Promise<Job[]>;
jobs.cancel(jobId: number): Promise<void>;
jobs.showLog(jobId: number): Promise<{ path: string }>;
jobs.onUpdate(cb: (j: Job) => void): () => void;  // returns unsubscribe
```

### `costs.*`

```ts
costs.mtd(projectId: string): Promise<{ elevenlabs: number; heygen: number; total: number }>;
costs.ledger(projectId: string): Promise<CostEntry[]>;
costs.exportCsv(projectId: string, outPath: string): Promise<void>;
```

### `settings.*`

```ts
settings.get(): Promise<AppSettings>;
settings.update(patch: Partial<AppSettings>): Promise<AppSettings>;
settings.openLogs(): Promise<void>;
settings.pickProjectsRoot(): Promise<string | null>;
```

## Bridge invariants

- **Validation**: every handler validates its input against a Zod schema before touching storage or providers. Validation errors return `{ code: 'validation', details }`.
- **Cancellation**: every long-running handler (`generate.run`, `compose.render`, training submits) accepts a `signal`-less invocation from the renderer; cancellation is initiated by the renderer calling `jobs.cancel(jobId)`, which causes the worker to abort its active fetch and mark the job canceled.
- **No Node primitives across the boundary**: no Buffer, no Date. Serialise to base64 (not used in v1) and ISO 8601 respectively; numeric timestamps are Unix seconds.
- **Event streams**: `jobs.onUpdate` is the only push channel. All other data is pulled by the renderer on demand or via query-refetch after a mutation.
