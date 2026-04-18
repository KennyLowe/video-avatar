import { BrowserWindow } from 'electron';
import { logger } from '@main/logging/jsonl.js';
import type { Job } from '@shared/schemas/job.js';

// Thin event bus between main-side code and the renderer-side useJobs hook.
//
// Push channel only. Handlers call `emitJobUpdated(slug, job)` after every
// write to the jobs table (status change, progress, completion). The
// preload bridge subscribes via ipcRenderer.on('jobs.update', …); the
// renderer's useJobs hook unwraps.

const CHANNEL = 'jobs.update';

export interface JobUpdateEvent {
  slug: string;
  job: Job;
}

export function emitJobUpdated(slug: string, job: Job): void {
  const payload: JobUpdateEvent = { slug, job };
  for (const window of BrowserWindow.getAllWindows()) {
    // guard against destroyed windows
    if (!window.isDestroyed()) {
      window.webContents.send(CHANNEL, payload);
    }
  }
  logger.trace('jobs.update emitted', { slug, jobId: job.id, status: job.status });
}

export function jobEventsChannel(): string {
  return CHANNEL;
}
