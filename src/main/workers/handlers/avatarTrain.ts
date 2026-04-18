import { openProjectDb } from '@main/data/db.js';
import { JobsRepository } from '@main/data/repositories/jobs.js';
import { AvatarsRepository } from '@main/data/repositories/avatars.js';
import * as heygen from '@main/providers/heygen.js';
import { logger } from '@main/logging/jsonl.js';
import { notify } from '@main/platform/notifier.js';
import { pollUntilTerminal } from '@main/workers/pollWithRetry.js';
import type { Job } from '@shared/schemas/job.js';
import type { AvatarTier } from '@shared/schemas/avatar.js';

// HeyGen avatar training. Photo Avatar is quick (minutes); Instant Avatar
// takes longer (tens of minutes). Both paths submit via HeyGen, poll until
// ready/failed via the shared pollUntilTerminal helper, and mark the row
// on completion.

export interface AvatarTrainInput {
  avatarRowId: number;
  tier: AvatarTier;
  name: string;
  /** For photo: a single image path. For instant: N segment paths. */
  sourcePaths: readonly string[];
}

// Photo Avatar: typical training is minutes; cap at 30 min.
// Instant Avatar: HeyGen documents up to hours; cap at 4 h.
const PHOTO_POLL_INTERVAL_MS = 15_000;
const PHOTO_POLL_TIMEOUT_MS = 30 * 60_000;
const INSTANT_POLL_INTERVAL_MS = 30_000;
const INSTANT_POLL_TIMEOUT_MS = 4 * 3_600_000;

export async function runAvatarTrain(ctx: {
  projectsRoot: string;
  slug: string;
  jobId: number;
  signal: AbortSignal;
}): Promise<{ avatarId: string; providerAvatarId: string }> {
  const db = openProjectDb({ projectsRoot: ctx.projectsRoot, slug: ctx.slug });
  const jobs = new JobsRepository(db, ctx.projectsRoot, ctx.slug);
  const avatars = new AvatarsRepository(db, ctx.projectsRoot, ctx.slug);

  const job = jobs.get(ctx.jobId);
  if (job === null) throw new Error(`Job ${ctx.jobId} not found.`);
  const input = parseInput(job);
  const avatarRow = avatars.get(input.avatarRowId);
  if (avatarRow === null) throw new Error(`Avatar row ${input.avatarRowId} not found.`);

  jobs.updateStatus(ctx.jobId, { status: 'running' });
  try {
    const { avatarId: providerAvatarId } =
      input.tier === 'photo'
        ? await heygen.createPhotoAvatar({
            imagePath: input.sourcePaths[0] ?? '',
            name: input.name,
          })
        : await heygen.createInstantAvatar({
            segmentPaths: input.sourcePaths,
            name: input.name,
          });

    jobs.updateStatus(ctx.jobId, { providerJobId: providerAvatarId });

    await pollUntilTerminal<true>(
      async () => {
        const s = await heygen.getAvatarStatus(providerAvatarId);
        if (s === 'ready') return { kind: 'done', value: true };
        if (s === 'failed')
          return { kind: 'failed', error: 'HeyGen reported avatar training failure.' };
        return { kind: 'pending' };
      },
      {
        signal: ctx.signal,
        pollIntervalMs: input.tier === 'photo' ? PHOTO_POLL_INTERVAL_MS : INSTANT_POLL_INTERVAL_MS,
        timeoutMs: input.tier === 'photo' ? PHOTO_POLL_TIMEOUT_MS : INSTANT_POLL_TIMEOUT_MS,
        label: `${input.tier === 'photo' ? 'Photo' : 'Instant'} Avatar ${providerAvatarId}`,
        onTransientRetry: (info) =>
          logger.warn('avatarTrain.poll transient error; retrying', {
            providerAvatarId,
            ...info,
          }),
      },
    );

    avatars.markReady(avatarRow.id, providerAvatarId);
    jobs.updateStatus(ctx.jobId, { status: 'done' });
    if (job.notifyOnComplete) {
      notify({
        title: 'Lumo — avatar ready',
        body: `${input.tier === 'photo' ? 'Photo' : 'Instant'} Avatar "${input.name}" finished training.`,
      });
    }
    return { avatarId: String(avatarRow.id), providerAvatarId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Best-effort cancel on remote if we got as far as a provider avatar id.
    if (typeof job.providerJobId === 'string' && job.providerJobId.length > 0) {
      heygen.cancelAvatarTraining(job.providerJobId).catch(() => undefined);
    }
    avatars.markFailed(avatarRow.id);
    jobs.updateStatus(ctx.jobId, { status: 'failed', error: message });
    if (job.notifyOnComplete) {
      notify({ title: 'Lumo — avatar training failed', body: message.slice(0, 200) });
    }
    throw err;
  }
}

function parseInput(job: Job): AvatarTrainInput {
  if (job.inputRef === null) throw new Error('avatarTrain job has no input_ref');
  try {
    return JSON.parse(job.inputRef) as AvatarTrainInput;
  } catch (cause) {
    throw new Error(`avatarTrain input_ref malformed: ${(cause as Error).message}`);
  }
}
