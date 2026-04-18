import { unlinkSync, existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { openProjectDb } from '@main/data/db.js';
import { JobsRepository } from '@main/data/repositories/jobs.js';
import { RendersRepository } from '@main/data/repositories/renders.js';
import * as remotion from '@main/providers/remotion.js';
import { bundledRootPath } from '@main/services/templateLoader.js';
import { projectDir } from '@main/platform/paths.js';
import { logger } from '@main/logging/jsonl.js';
import { notify } from '@main/platform/notifier.js';
import type { Job } from '@shared/schemas/job.js';

// Composition render job handler per FR-041 / FR-042. Bundles the Root.tsx
// once per session, then calls Remotion's renderer. Cancellation removes
// the partial output file.

export interface RenderJobInput {
  templateId: string;
  props: unknown;
  settings: {
    resolution: '1080p30' | '1080p60' | '4k30';
    codec: 'h264' | 'h265';
    preset: 'fast' | 'balanced' | 'quality';
    audioBitrate: string;
  };
  scriptId: number | null;
  slug: string;
  title: string;
}

const PRESET_MAP: Record<
  RenderJobInput['settings']['preset'],
  { ffmpegPreset: 'veryfast' | 'medium' | 'slow'; crf: number }
> = {
  fast: { ffmpegPreset: 'veryfast', crf: 26 },
  balanced: { ffmpegPreset: 'medium', crf: 22 },
  quality: { ffmpegPreset: 'slow', crf: 18 },
};

export async function runRender(ctx: {
  projectsRoot: string;
  slug: string;
  jobId: number;
  signal: AbortSignal;
}): Promise<{ renderId: number; outputPath: string }> {
  const db = openProjectDb({ projectsRoot: ctx.projectsRoot, slug: ctx.slug });
  const jobs = new JobsRepository(db, ctx.projectsRoot, ctx.slug);
  const renders = new RendersRepository(db, ctx.projectsRoot, ctx.slug);

  const job = jobs.get(ctx.jobId);
  if (job === null) throw new Error(`Job ${ctx.jobId} not found.`);
  const input = parseInput(job);

  jobs.updateStatus(ctx.jobId, { status: 'running' });

  const rendersDir = path.resolve(projectDir(ctx.projectsRoot, ctx.slug), 'renders');
  mkdirSync(rendersDir, { recursive: true });
  const slug = slugify(input.title);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.resolve(
    rendersDir,
    `${slug}-${timestamp}-${randomUUID().slice(0, 8)}.mp4`,
  );

  const preset = PRESET_MAP[input.settings.preset];

  try {
    const serveUrl = await remotion.bundleOnce(bundledRootPath());
    await remotion.renderMedia({
      serveUrl,
      compositionId: input.templateId,
      inputProps: input.props,
      outputPath,
      codec: input.settings.codec,
      crf: preset.crf,
      ffmpegPreset: preset.ffmpegPreset,
      audioCodec: 'aac',
      audioBitrate: input.settings.audioBitrate,
      onProgress: ({ renderedFrames, totalFrames }) => {
        logger.debug('render.progress', {
          jobId: ctx.jobId,
          renderedFrames,
          totalFrames,
        });
      },
      signal: ctx.signal,
    });

    const renderRelPath = path.relative(projectDir(ctx.projectsRoot, ctx.slug), outputPath);
    const render = renders.create({
      kind: 'composed',
      scriptId: input.scriptId,
      voiceId: null,
      avatarId: null,
      generationMode: null,
      templateId: input.templateId,
      propsJson: JSON.stringify(input.props),
      outputPath: renderRelPath,
    });
    jobs.updateStatus(ctx.jobId, { status: 'done', outputPath: renderRelPath });
    if (job.notifyOnComplete) {
      notify({
        title: 'Lumo — composition rendered',
        body: `${input.title} is ready.`,
      });
    }
    return { renderId: render.id, outputPath };
  } catch (err) {
    const cancelled = ctx.signal.aborted;
    // Partial file cleanup (FR-042). Best-effort; ignore errors.
    try {
      if (existsSync(outputPath)) unlinkSync(outputPath);
    } catch {
      // ignore
    }
    const message = err instanceof Error ? err.message : String(err);
    jobs.updateStatus(ctx.jobId, {
      status: cancelled ? 'canceled' : 'failed',
      error: message,
    });
    if (!cancelled && job.notifyOnComplete) {
      notify({ title: 'Lumo — render failed', body: message.slice(0, 200) });
    }
    throw err;
  }
}

function parseInput(job: Job): RenderJobInput {
  if (job.inputRef === null) throw new Error('render job has no input_ref');
  try {
    return JSON.parse(job.inputRef) as RenderJobInput;
  } catch (cause) {
    throw new Error(`render input_ref malformed: ${(cause as Error).message}`);
  }
}

function slugify(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base.length > 0 ? base : 'render';
}
