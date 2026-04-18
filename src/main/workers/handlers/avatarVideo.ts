import { writeFileSync, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '@main/logging/jsonl.js';
import { notify } from '@main/platform/notifier.js';
import { ProviderError } from '@shared/errors.js';
import { openProjectDb } from '@main/data/db.js';
import { JobsRepository } from '@main/data/repositories/jobs.js';
import { CostsRepository } from '@main/data/repositories/costs.js';
import { RendersRepository } from '@main/data/repositories/renders.js';
import { ScriptsRepository } from '@main/data/repositories/scripts.js';
import * as elevenlabs from '@main/providers/elevenlabs.js';
import * as heygen from '@main/providers/heygen.js';
import * as transport from '@main/providers/transport.js';
import { projectDir } from '@main/platform/paths.js';
import { estimatePipelineCost } from '@main/services/costEstimator.js';
import type { Job } from '@shared/schemas/job.js';
import type { GenerationMode } from '@shared/schemas/render.js';

// The P1 MVP pipeline. One job kind, one handler, the whole happy path:
// TTS → upload → generate → poll → download → ledger → notify.

export interface AvatarVideoInput {
  scriptId: number;
  voiceId: string;
  voiceRowId: number | null;
  avatarId: string;
  avatarRowId: number | null;
  mode: GenerationMode;
}

export interface AvatarVideoResult {
  renderId: number;
  outputPath: string;
}

const POLL_INTERVAL_MS = 4_000;
const POLL_TIMEOUT_MS = 30 * 60_000; // 30 min hard cap; HeyGen is usually 1–5 min.

// Error codes that represent a transient condition and should be retried on
// the poll loop rather than failing the whole job. Anything else (401, 403,
// invalid_upload_response, etc.) is a hard failure.
const TRANSIENT_ERROR_CODES = new Set([
  'rate_limited',
  'provider_unavailable',
  'timeout',
  'network_error',
]);

// Back-off schedule for transient errors during status polling. Caps at ~62 s.
const POLL_RETRY_BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 32_000] as const;

export async function runAvatarVideo(ctx: {
  projectsRoot: string;
  slug: string;
  jobId: number;
  signal: AbortSignal;
}): Promise<AvatarVideoResult> {
  const db = openProjectDb({ projectsRoot: ctx.projectsRoot, slug: ctx.slug });
  const jobs = new JobsRepository(db, ctx.projectsRoot, ctx.slug);
  const costs = new CostsRepository(db, ctx.projectsRoot, ctx.slug);
  const renders = new RendersRepository(db, ctx.projectsRoot, ctx.slug);
  const scripts = new ScriptsRepository(db, ctx.projectsRoot, ctx.slug);

  const job = jobs.get(ctx.jobId);
  if (job === null) throw new Error(`Job ${ctx.jobId} not found.`);
  const input = parseInput(job);
  const script = scripts.get(input.scriptId);
  if (script === null) throw new Error(`Script ${input.scriptId} not found.`);

  jobs.updateStatus(ctx.jobId, { status: 'running' });
  try {
    // --- Step 1: TTS ---------------------------------------------------
    const { mp3, characters } = await elevenlabs.tts({
      voiceId: input.voiceId,
      text: script.bodyMd,
      ...(ctx.signal.aborted ? {} : { signal: ctx.signal }),
    });
    const ttsPath = path.join(
      projectDir(ctx.projectsRoot, ctx.slug),
      'audio',
      'tts',
      `${randomUUID()}.mp3`,
    );
    writeFileSync(ttsPath, mp3);
    const ttsCost = estimatePipelineCost({
      characterCount: characters,
      estimatedDurationSeconds: script.estimatedSeconds,
      mode: input.mode,
    });
    costs.record({
      jobId: ctx.jobId,
      provider: 'elevenlabs',
      operation: 'tts',
      units: characters,
      unitKind: 'characters',
      usdEstimate: ttsCost.elevenlabs.usd,
    });

    // --- Step 2: Transport ---------------------------------------------
    const t = transport.resolve({ uploadTransport: 'heygen' });
    const put = await t.put(ttsPath);
    const audioAssetId = put.assetId;
    if (typeof audioAssetId !== 'string') {
      throw new Error(`Transport ${t.kind} did not return an assetId (got ${put.kind}).`);
    }

    // --- Step 3: Generate ----------------------------------------------
    const { videoJobId } = await heygen.generateVideo({
      avatarId: input.avatarId,
      audioAssetId,
      mode: input.mode,
    });
    jobs.updateStatus(ctx.jobId, { providerJobId: videoJobId });

    // --- Step 4: Poll --------------------------------------------------
    const videoUrl = await pollHeyGen(videoJobId, ctx.signal);

    // --- Step 5: Download ----------------------------------------------
    const outputPath = path.join(
      projectDir(ctx.projectsRoot, ctx.slug),
      'video',
      'avatar',
      `${script.slug}-${randomUUID()}.mp4`,
    );
    await downloadTo(videoUrl, outputPath, ctx.signal);

    // --- Step 6: Ledger + render row -----------------------------------
    costs.record({
      jobId: ctx.jobId,
      provider: 'heygen',
      operation: input.mode === 'avatar_iv' ? 'avatar_video_iv' : 'avatar_video_standard',
      units: ttsCost.heygen.credits,
      unitKind: 'credits',
      usdEstimate: ttsCost.heygen.usd,
    });
    const renderRelPath = path.relative(projectDir(ctx.projectsRoot, ctx.slug), outputPath);
    const render = renders.create({
      kind: 'avatar_clip',
      scriptId: input.scriptId,
      voiceId: input.voiceRowId,
      avatarId: input.avatarRowId,
      generationMode: input.mode,
      templateId: null,
      propsJson: null,
      outputPath: renderRelPath,
    });

    jobs.updateStatus(ctx.jobId, { status: 'done', outputPath: renderRelPath });
    if (job.notifyOnComplete) {
      notify({
        title: 'Lumo — avatar video ready',
        body: `${script.title} — ${input.mode === 'avatar_iv' ? 'Avatar IV' : 'Standard'} render complete.`,
      });
    }
    return { renderId: render.id, outputPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    jobs.updateStatus(ctx.jobId, { status: 'failed', error: message });
    if (job.notifyOnComplete) {
      notify({
        title: 'Lumo — avatar video failed',
        body: message.slice(0, 200),
      });
    }
    throw err;
  }
}

async function pollHeyGen(videoJobId: string, signal: AbortSignal): Promise<string> {
  const startedAt = Date.now();
  let transientFailures = 0;
  // Simple wall-clock loop; the queue's exponential back-off policy (5 s →
  // 2 min cap) governs cross-restart polling via the reconciler. This inner
  // loop only handles in-process retries of transient errors.
  while (!signal.aborted) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error(`Timed out waiting for HeyGen video ${videoJobId} after 30 minutes.`);
    }
    try {
      const status = await heygen.getVideoStatus(videoJobId);
      transientFailures = 0;
      if (status.status === 'completed') return status.videoUrl;
      if (status.status === 'failed') throw new Error(`HeyGen reported failure: ${status.error}`);
      await sleep(POLL_INTERVAL_MS, signal);
    } catch (err) {
      if (!isTransientProviderError(err) || transientFailures >= POLL_RETRY_BACKOFF_MS.length) {
        throw err;
      }
      const backoffMs = POLL_RETRY_BACKOFF_MS[transientFailures] ?? POLL_INTERVAL_MS;
      transientFailures += 1;
      logger.warn('avatarVideo.poll transient error; retrying', {
        videoJobId,
        attempt: transientFailures,
        backoffMs,
        code: (err as ProviderError).code,
      });
      await sleep(backoffMs, signal);
    }
  }
  throw new Error('Avatar video job was cancelled.');
}

function isTransientProviderError(err: unknown): boolean {
  return err instanceof ProviderError && TRANSIENT_ERROR_CODES.has(err.code);
}

async function downloadTo(url: string, outputPath: string, signal: AbortSignal): Promise<void> {
  const webStream = await heygen.downloadCompletedVideo(url, { signal });
  const nodeStream = Readable.fromWeb(webStream as unknown as NodeReadableStream);
  await pipeline(nodeStream, createWriteStream(outputPath));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

interface StoredInput {
  scriptId: number;
  voiceId: string;
  voiceRowId: number | null;
  avatarId: string;
  avatarRowId: number | null;
  mode: GenerationMode;
}

function parseInput(job: Job): StoredInput {
  if (job.inputRef === null) throw new Error('avatarVideo job has no input_ref');
  try {
    const parsed = JSON.parse(job.inputRef) as StoredInput;
    logger.debug('avatarVideo.parseInput', {
      scriptId: parsed.scriptId,
      mode: parsed.mode,
    });
    return parsed;
  } catch (cause) {
    throw new Error(`avatarVideo job has malformed input_ref: ${(cause as Error).message}`);
  }
}
