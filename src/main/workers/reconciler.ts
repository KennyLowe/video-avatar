import { logger } from '@main/logging/jsonl.js';
import { getSettings } from '@main/platform/settings.js';
import { listProjects } from '@main/data/projects.js';
import { openProjectDb } from '@main/data/db.js';
import { JobsRepository } from '@main/data/repositories/jobs.js';
import * as heygen from '@main/providers/heygen.js';
import * as elevenlabs from '@main/providers/elevenlabs.js';
import type { Job } from '@shared/schemas/job.js';

// Launch reconciler per Technical Invariant "Long jobs … reconciles state with
// each provider before accepting new jobs." Sweeps every project's active jobs
// on first launch and:
//   * Jobs still `queued` with no `providerJobId` → leave alone (the queue
//     worker picks them up naturally).
//   * Jobs `running` with a `providerJobId` → ask the provider what happened.
//     If the provider reports terminal state, persist it so the UI and queue
//     don't double-run the same job.
//   * Jobs `running` with no `providerJobId` → crashed before submission.
//     Mark `failed` with a reconciler-authored error so the operator sees
//     what happened instead of the job dangling.
//
// Partial state (e.g. a completed HeyGen render whose MP4 never downloaded)
// is not auto-resumed here — the UI can offer a "download again" on the
// render row. Best behaviour is to mark the row terminal and let the
// operator re-run explicitly.

let hasRun = false;

interface ReconcilerDeps {
  readonly fetchProjects: () => string[];
  readonly openDb: (slug: string) => ReturnType<typeof openProjectDb>;
  readonly getVideoStatus: typeof heygen.getVideoStatus;
  readonly getAvatarStatus: typeof heygen.getAvatarStatus;
  readonly getVoiceStatus: typeof elevenlabs.getVoiceStatus;
}

export async function reconcileOnLaunch(deps?: Partial<ReconcilerDeps>): Promise<void> {
  if (hasRun) return;
  hasRun = true;
  logger.info('reconciler.start');

  const resolved = resolveDeps(deps);
  let slugs: string[];
  try {
    slugs = resolved.fetchProjects();
  } catch (err) {
    logger.warn('reconciler.list_projects_failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    logger.info('reconciler.done', { jobsFound: 0 });
    return;
  }

  let reconciled = 0;
  let examined = 0;
  const root = getSettings().projectsRoot;
  for (const slug of slugs) {
    try {
      const db = resolved.openDb(slug);
      const jobs = new JobsRepository(db, root ?? '', slug);
      const active = jobs.listActive();
      examined += active.length;
      for (const job of active) {
        try {
          const didReconcile = await reconcileJob(job, jobs, resolved);
          if (didReconcile) reconciled += 1;
        } catch (err) {
          logger.warn('reconciler.job_failed', {
            slug,
            jobId: job.id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      logger.warn('reconciler.project_failed', {
        slug,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('reconciler.done', { projects: slugs.length, examined, reconciled });
}

async function reconcileJob(job: Job, jobs: JobsRepository, deps: ReconcilerDeps): Promise<boolean> {
  // Running without a providerJobId — crashed mid-submission. Don't re-submit
  // silently; mark failed so the UI surfaces it.
  if (job.status === 'running' && (job.providerJobId === null || job.providerJobId.length === 0)) {
    jobs.updateStatus(job.id, {
      status: 'failed',
      error: 'Reconciler: job was running at launch with no provider id. Resubmit to continue.',
    });
    return true;
  }

  // Queued jobs: leave to the queue.
  if (job.status !== 'running') return false;

  const providerJobId = job.providerJobId;
  if (providerJobId === null || providerJobId.length === 0) return false;

  switch (job.kind) {
    case 'avatar_video':
      return reconcileVideoJob(job, providerJobId, jobs, deps);
    case 'avatar_train':
      return reconcileAvatarJob(job, providerJobId, jobs, deps);
    case 'voice_train':
      return reconcileVoiceJob(job, providerJobId, jobs, deps);
    case 'render':
      // Remotion renders are local; if we died mid-render the partial file
      // was cleaned up by the handler's catch. Mark failed and let the
      // operator re-queue.
      jobs.updateStatus(job.id, {
        status: 'failed',
        error: 'Reconciler: render was interrupted by shutdown. Re-queue to retry.',
      });
      return true;
    default:
      return false;
  }
}

async function reconcileVideoJob(
  job: Job,
  providerJobId: string,
  jobs: JobsRepository,
  deps: ReconcilerDeps,
): Promise<boolean> {
  const s = await deps.getVideoStatus(providerJobId);
  if (s.status === 'completed') {
    jobs.updateStatus(job.id, {
      status: 'failed',
      error:
        'Reconciler: HeyGen reports completion but the MP4 was never downloaded. Re-queue to retry.',
    });
    return true;
  }
  if (s.status === 'failed') {
    jobs.updateStatus(job.id, { status: 'failed', error: s.error });
    return true;
  }
  return false;
}

async function reconcileAvatarJob(
  job: Job,
  providerJobId: string,
  jobs: JobsRepository,
  deps: ReconcilerDeps,
): Promise<boolean> {
  const s = await deps.getAvatarStatus(providerJobId);
  if (s === 'ready') {
    jobs.updateStatus(job.id, { status: 'done' });
    return true;
  }
  if (s === 'failed') {
    jobs.updateStatus(job.id, {
      status: 'failed',
      error: 'HeyGen reported avatar training failure.',
    });
    return true;
  }
  return false;
}

async function reconcileVoiceJob(
  job: Job,
  providerJobId: string,
  jobs: JobsRepository,
  deps: ReconcilerDeps,
): Promise<boolean> {
  const s = await deps.getVoiceStatus(providerJobId);
  if (s === 'ready') {
    jobs.updateStatus(job.id, { status: 'done' });
    return true;
  }
  if (s === 'failed') {
    jobs.updateStatus(job.id, {
      status: 'failed',
      error: 'ElevenLabs reported voice training failure.',
    });
    return true;
  }
  return false;
}

function resolveDeps(partial?: Partial<ReconcilerDeps>): ReconcilerDeps {
  return {
    fetchProjects:
      partial?.fetchProjects ??
      ((): string[] => {
        const root = getSettings().projectsRoot;
        if (root === null) return [];
        return listProjects(root).map((p) => p.slug);
      }),
    openDb:
      partial?.openDb ??
      ((slug: string) => {
        const root = getSettings().projectsRoot;
        if (root === null) {
          throw new Error('reconciler.openDb called without a projectsRoot');
        }
        return openProjectDb({ projectsRoot: root, slug });
      }),
    getVideoStatus: partial?.getVideoStatus ?? heygen.getVideoStatus,
    getAvatarStatus: partial?.getAvatarStatus ?? heygen.getAvatarStatus,
    getVoiceStatus: partial?.getVoiceStatus ?? elevenlabs.getVoiceStatus,
  };
}

export function __resetForTests(): void {
  hasRun = false;
}
