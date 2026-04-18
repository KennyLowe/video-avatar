import { shell } from 'electron';
import { handle } from './index.js';
import { getSettings } from '@main/platform/settings.js';
import { openProjectDb } from '@main/data/db.js';
import { JobsRepository } from '@main/data/repositories/jobs.js';
import { cancelJob as cancelJobInQueue } from '@main/workers/jobQueue.js';
import { getLogsDir } from '@main/platform/paths.js';

// jobs.* IPC surface per contracts/ipc-bridge.md.
// The `onUpdate` push channel is wired in the preload bridge via
// ipcRenderer.on('jobs.update', cb); see src/main/workers/jobEvents.ts for
// the emission side.

export function registerJobsIpc(): void {
  handle('jobs.listActive', async (input) => {
    const { slug } = input as { slug: string };
    const jobs = openRepo(slug);
    return jobs.listActive();
  });

  handle('jobs.listHistory', async (input) => {
    const { slug, limit } = input as { slug: string; limit?: number };
    const jobs = openRepo(slug);
    return jobs.listHistory(Math.max(1, Math.min(1000, limit ?? 100)));
  });

  handle('jobs.cancel', async (input) => {
    const { slug, jobId } = input as { slug: string; jobId: number };
    const cancelled = cancelJobInQueue(jobId);
    if (!cancelled) {
      // Job isn't currently running in the worker; mark it canceled in the
      // table so the row reflects operator intent.
      const jobs = openRepo(slug);
      jobs.updateStatus(jobId, { status: 'canceled' });
    }
    return { cancelled };
  });

  handle('jobs.showLog', async () => {
    // Opens the current day's JSONL log in the operator's default handler.
    // Individual job logs are filtered client-side by jobId.
    const dir = getLogsDir();
    shell.openPath(dir).catch(() => undefined);
    return { path: dir };
  });
}

function openRepo(slug: string): JobsRepository {
  const root = getSettings().projectsRoot;
  if (root === null) throw new Error('No projects root configured.');
  const db = openProjectDb({ projectsRoot: root, slug });
  return new JobsRepository(db, root, slug);
}
