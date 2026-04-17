import { logger } from '@main/logging/jsonl.js';

// Single-consumer polling loop. Scaffolding only in Phase 2; concrete job
// handlers (avatarVideo, voiceTrain, etc.) arrive in later phases and register
// themselves via `registerHandler`. The queue holds no state of its own —
// active jobs live in the `jobs` SQLite table, identified by provider job id.

const BACKOFF_SCHEDULE_MS = [5_000, 10_000, 20_000, 40_000, 80_000, 120_000] as const;
const MAX_BACKOFF_MS = 120_000;

export type JobKind = 'voice_train' | 'avatar_train' | 'tts' | 'avatar_video' | 'render';

export interface JobContext {
  readonly jobId: number;
  readonly projectsRoot: string;
  readonly slug: string;
  readonly signal: AbortSignal;
}

export type JobHandler = (ctx: JobContext) => Promise<void>;

const handlers = new Map<JobKind, JobHandler>();
const abortControllers = new Map<number, AbortController>();
let runningTick: Promise<void> | null = null;
let stopped = false;

export function registerHandler(kind: JobKind, handler: JobHandler): void {
  handlers.set(kind, handler);
}

/** Schedule the next back-off delay for a given attempt count. */
export function nextBackoffMs(attempt: number): number {
  const index = Math.min(attempt, BACKOFF_SCHEDULE_MS.length - 1);
  return BACKOFF_SCHEDULE_MS[index] ?? MAX_BACKOFF_MS;
}

export function cancelJob(jobId: number): boolean {
  const ctrl = abortControllers.get(jobId);
  if (!ctrl) return false;
  ctrl.abort();
  return true;
}

/**
 * Run a single queue tick. Phase 2 provides the skeleton only; the actual
 * pickup / SQL query / handler-dispatch logic lands with the first job kind
 * (Phase 3, `avatarVideo`).
 */
export async function tick(): Promise<void> {
  if (runningTick) return runningTick;
  runningTick = (async () => {
    if (stopped) return;
    if (handlers.size === 0) return;
    // Real implementation arrives with Phase 3. Logging a trace here so we
    // can confirm the worker is wired up end-to-end during bring-up.
    logger.trace('jobQueue.tick', { handlers: Array.from(handlers.keys()) });
  })();
  try {
    await runningTick;
  } finally {
    runningTick = null;
  }
}

export function stop(): void {
  stopped = true;
  for (const ctrl of abortControllers.values()) ctrl.abort();
  abortControllers.clear();
}

/** Testing hook: clear all handlers between specs. */
export function __resetForTests(): void {
  handlers.clear();
  abortControllers.clear();
  stopped = false;
}
