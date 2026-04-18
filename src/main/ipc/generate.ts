import { handle } from './index.js';
import { getSettings } from '@main/platform/settings.js';
import { openProjectDb } from '@main/data/db.js';
import { JobsRepository } from '@main/data/repositories/jobs.js';
import { ScriptsRepository } from '@main/data/repositories/scripts.js';
import { CostsRepository } from '@main/data/repositories/costs.js';
import { estimatePipelineCost } from '@main/services/costEstimator.js';
import { runNow } from '@main/workers/jobQueue.js';
import { logger } from '@main/logging/jsonl.js';
import type { GenerationMode } from '@shared/schemas/render.js';

// generate.* IPC surface. costPreview is synchronous on the main process
// (no paid calls). run persists a jobs row and hands off to the worker.

export function registerGenerateIpc(): void {
  handle('generate.costPreview', async (input) => {
    const { slug, scriptId, mode } = input as {
      slug: string;
      scriptId: number;
      mode: GenerationMode;
    };
    const root = requireRoot();
    const db = openProjectDb({ projectsRoot: root, slug });
    const scripts = new ScriptsRepository(db, root, slug);
    const script = scripts.get(scriptId);
    if (script === null) throw new Error(`Script ${scriptId} not found.`);
    const estimate = estimatePipelineCost({
      characterCount: script.bodyMd.length,
      estimatedDurationSeconds: script.estimatedSeconds,
      mode,
    });
    const costs = new CostsRepository(db, root, slug);
    const mtd = costs.mtd();
    const mtdMap = Object.fromEntries(mtd.map((r) => [r.provider, r.totalUsd])) as Record<
      'elevenlabs' | 'heygen',
      number
    >;
    return {
      elevenlabs: {
        characters: estimate.elevenlabs.characters,
        credits: estimate.elevenlabs.credits,
        usd: estimate.elevenlabs.usd,
      },
      heygen: {
        seconds: estimate.heygen.seconds,
        credits: estimate.heygen.credits,
        usd: estimate.heygen.usd,
      },
      totalUsd: estimate.totalUsd,
      mtdUsd: {
        elevenlabs: mtdMap.elevenlabs ?? 0,
        heygen: mtdMap.heygen ?? 0,
      },
    };
  });

  handle('generate.run', async (input) => {
    const { slug, scriptId, voiceId, voiceRowId, avatarId, avatarRowId, mode } = input as {
      slug: string;
      scriptId: number;
      voiceId: string;
      voiceRowId: number | null;
      avatarId: string;
      avatarRowId: number | null;
      mode: GenerationMode;
    };
    const root = requireRoot();
    const db = openProjectDb({ projectsRoot: root, slug });
    const jobs = new JobsRepository(db, root, slug);
    const job = jobs.create({
      provider: 'heygen',
      kind: 'avatar_video',
      inputRef: JSON.stringify({ scriptId, voiceId, voiceRowId, avatarId, avatarRowId, mode }),
    });
    // Kick the handler off immediately. Intentionally not awaited — the
    // renderer gets the jobId synchronously and subscribes to status updates
    // via jobs.onUpdate (lands in Phase 7 T122). Failures are persisted on
    // the job row by the handler's own try/catch.
    void runNow('avatar_video', { jobId: job.id, projectsRoot: root, slug }).catch((err) => {
      logger.warn('generate.run handler rejected', {
        jobId: job.id,
        message: err instanceof Error ? err.message : String(err),
      });
    });
    return { jobId: job.id };
  });
}

function requireRoot(): string {
  const root = getSettings().projectsRoot;
  if (root === null) throw new Error('No projects root configured.');
  return root;
}
