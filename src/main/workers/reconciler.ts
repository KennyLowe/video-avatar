import { logger } from '@main/logging/jsonl.js';

// Launch reconciler. On app start this sweeps any `jobs` row left in a
// non-terminal state, asks the owning provider for its current status, and
// updates the row before the queue accepts new work. Phase 2 provides the
// skeleton; the per-provider status calls land with the provider wrappers in
// Phase 3.

let hasRun = false;

export async function reconcileOnLaunch(): Promise<void> {
  if (hasRun) return;
  hasRun = true;
  logger.info('reconciler.start');
  // Phase 3 wires this to openProjectDb / providers.heygen.getVideoStatus etc.
  // Phase 2 deliberately runs an empty pass so the call is present in the
  // bootstrap sequence and missing-step regressions show up immediately.
  logger.info('reconciler.done', { jobsFound: 0 });
}

export function __resetForTests(): void {
  hasRun = false;
}
