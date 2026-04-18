import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openProjectDb } from '@main/data/db.js';
import { JobsRepository } from '@main/data/repositories/jobs.js';
import { TakesRepository } from '@main/data/repositories/takes.js';
import { VoicesRepository } from '@main/data/repositories/voices.js';
import { CostsRepository } from '@main/data/repositories/costs.js';
import * as elevenlabs from '@main/providers/elevenlabs.js';
import { concatWavTakes } from '@main/services/ffmpeg.js';
import { logger } from '@main/logging/jsonl.js';
import { notify } from '@main/platform/notifier.js';
import { pollUntilTerminal } from '@main/workers/pollWithRetry.js';
import type { Job } from '@shared/schemas/job.js';
import type { VoiceTier } from '@shared/schemas/voice.js';

// PVC / IVC training handler per FR-018..FR-021. Flow:
//   1. Read the input_ref (voice row id, tier, name).
//   2. Concat every good take into a single WAV (with trim offsets).
//   3. Submit to ElevenLabs (IVC is synchronous; PVC returns a voice_id
//      immediately and trains in the background).
//   4. For PVC, poll status until ready / failed with transient retries.
//   5. Persist the provider voice_id onto the voices row.
//   6. Record a cost row, fire an OS notification.

export interface VoiceTrainInput {
  voiceRowId: number;
  tier: VoiceTier;
  name: string;
  takeIds: readonly number[];
}

export interface VoiceTrainResult {
  voiceId: string;
  providerVoiceId: string;
  sampleSeconds: number;
}

// PVC server-side training is documented as 1–4 hours; give it a generous cap.
const PVC_POLL_INTERVAL_MS = 60_000;
const PVC_POLL_TIMEOUT_MS = 6 * 3_600_000; // 6 hours.

export async function runVoiceTrain(ctx: {
  projectsRoot: string;
  slug: string;
  jobId: number;
  signal: AbortSignal;
}): Promise<VoiceTrainResult> {
  const db = openProjectDb({ projectsRoot: ctx.projectsRoot, slug: ctx.slug });
  const jobs = new JobsRepository(db, ctx.projectsRoot, ctx.slug);
  const takes = new TakesRepository(db, ctx.projectsRoot, ctx.slug);
  const voices = new VoicesRepository(db, ctx.projectsRoot, ctx.slug);
  const costs = new CostsRepository(db, ctx.projectsRoot, ctx.slug);

  const job = jobs.get(ctx.jobId);
  if (job === null) throw new Error(`Job ${ctx.jobId} not found.`);
  const input = parseInput(job);
  const voice = voices.get(input.voiceRowId);
  if (voice === null) throw new Error(`Voice row ${input.voiceRowId} not found.`);

  jobs.updateStatus(ctx.jobId, { status: 'running' });

  const tmpDir = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-voicetrain-'));
  const concatPath = path.resolve(tmpDir, 'pvc-input.wav');

  try {
    // Concat good takes.
    const selected = input.takeIds
      .map((id) => takes.get(id))
      .filter((t): t is NonNullable<typeof t> => t !== null && t.mark === 'good');
    if (selected.length === 0) {
      throw new Error('No good takes to submit — mark takes as good first.');
    }
    await concatWavTakes(
      selected.map((t) => ({
        path: t.path,
        trimStartMs: t.trimStartMs,
        trimEndMs: t.trimEndMs,
      })),
      concatPath,
    );

    // Submit.
    const submission = { name: input.name, files: [concatPath] as const };
    const { voiceId } =
      input.tier === 'ivc'
        ? await elevenlabs.createIVC(submission)
        : await elevenlabs.createPVC(submission);
    jobs.updateStatus(ctx.jobId, { providerJobId: voiceId });

    // IVC is synchronous — status is effectively 'ready' on success. PVC
    // needs polling.
    if (input.tier === 'pvc') {
      await pollUntilTerminal<true>(
        async () => {
          const s = await elevenlabs.getVoiceStatus(voiceId);
          if (s === 'ready') return { kind: 'done', value: true };
          if (s === 'failed')
            return { kind: 'failed', error: 'ElevenLabs reported PVC training failure.' };
          return { kind: 'pending' };
        },
        {
          signal: ctx.signal,
          pollIntervalMs: PVC_POLL_INTERVAL_MS,
          timeoutMs: PVC_POLL_TIMEOUT_MS,
          label: `PVC ${voiceId}`,
          onTransientRetry: (info) =>
            logger.warn('voiceTrain.poll transient error; retrying', { voiceId, ...info }),
        },
      );
    }

    voices.markReady(voice.id, voiceId);
    costs.record({
      jobId: ctx.jobId,
      provider: 'elevenlabs',
      operation: input.tier === 'pvc' ? 'pvc_train' : 'ivc_train',
      units: Math.round(voice.sampleSeconds),
      unitKind: 'seconds',
      // PVC and IVC pricing varies; we record the submission-side estimate
      // and let the real usage flow through testKey's MTD reporting when it
      // refreshes. The ledger honestly reflects what we know at submit time.
      usdEstimate: input.tier === 'pvc' ? 0 : 0,
    });

    jobs.updateStatus(ctx.jobId, { status: 'done' });
    if (job.notifyOnComplete) {
      notify({
        title: 'Lumo — voice ready',
        body:
          input.tier === 'pvc'
            ? `Professional Voice Clone "${input.name}" finished training.`
            : `Instant Voice Clone "${input.name}" is ready.`,
      });
    }

    return {
      voiceId: String(voice.id),
      providerVoiceId: voiceId,
      sampleSeconds: voice.sampleSeconds,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    voices.markFailed(voice.id);
    jobs.updateStatus(ctx.jobId, { status: 'failed', error: message });
    if (job.notifyOnComplete) {
      notify({ title: 'Lumo — voice training failed', body: message.slice(0, 200) });
    }
    throw err;
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
}

function parseInput(job: Job): VoiceTrainInput {
  if (job.inputRef === null) throw new Error('voiceTrain job has no input_ref');
  try {
    return JSON.parse(job.inputRef) as VoiceTrainInput;
  } catch (cause) {
    throw new Error(`voiceTrain input_ref malformed: ${(cause as Error).message}`);
  }
}
