import { copyFileSync } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { handle } from './index.js';
import { getSettings } from '@main/platform/settings.js';
import { openProjectDb } from '@main/data/db.js';
import { AvatarsRepository } from '@main/data/repositories/avatars.js';
import { SegmentsRepository } from '@main/data/repositories/segments.js';
import { JobsRepository } from '@main/data/repositories/jobs.js';
import { projectDir } from '@main/platform/paths.js';
import { extractFrame, extractSegment } from '@main/services/ffmpeg.js';
import { probeImage, probeVideo } from '@main/services/ffprobe.js';
import { runNow } from '@main/workers/jobQueue.js';
import { logger } from '@main/logging/jsonl.js';
import type { AvatarTier } from '@shared/schemas/avatar.js';

// avatars.* IPC surface per FR-023..FR-029.
// Import → probe → segment (video only) → train → poll → ready.
// preview is a thin alias over the avatar-video pipeline (lands in Phase 6's
// compose flow too, but the surface is stable here).

export function registerAvatarsIpc(): void {
  handle('avatars.list', async (input) => {
    const { slug } = input as { slug: string };
    const { avatars } = openRepos(slug);
    return avatars.list();
  });

  handle('avatars.listSegments', async (input) => {
    const { slug } = input as { slug: string };
    const { segments } = openRepos(slug);
    return segments.list();
  });

  handle('avatars.probeVideo', async (input) => {
    const { sourcePath } = input as { sourcePath: string };
    return probeVideo(sourcePath);
  });

  handle('avatars.probeImage', async (input) => {
    const { sourcePath } = input as { sourcePath: string };
    return probeImage(sourcePath);
  });

  /**
   * Import a source video into the project. Copies (never moves) the source
   * to `<project>/video/source/<uuid>.<ext>` and returns the relative path
   * plus probe metadata.
   */
  handle('avatars.importVideo', async (input) => {
    const { slug, sourcePath } = input as { slug: string; sourcePath: string };
    const root = requireRoot();
    const ext = path.extname(sourcePath) || '.mp4';
    const destPath = path.resolve(
      projectDir(root, slug),
      'video',
      'source',
      `${randomUUID()}${ext}`,
    );
    copyFileSync(sourcePath, destPath);
    const probe = await probeVideo(destPath);
    return { path: destPath, probe };
  });

  handle('avatars.importImage', async (input) => {
    const { slug, sourcePath } = input as { slug: string; sourcePath: string };
    const root = requireRoot();
    const ext = path.extname(sourcePath) || '.png';
    const destPath = path.resolve(
      projectDir(root, slug),
      'video',
      'source',
      `${randomUUID()}${ext}`,
    );
    copyFileSync(sourcePath, destPath);
    const probe = await probeImage(destPath);
    return { path: destPath, probe };
  });

  handle('avatars.grabFrame', async (input) => {
    const { slug, sourcePath, atSeconds } = input as {
      slug: string;
      sourcePath: string;
      atSeconds: number;
    };
    const root = requireRoot();
    const out = path.resolve(
      projectDir(root, slug),
      'video',
      'source',
      `frame-${randomUUID()}.png`,
    );
    await extractFrame(sourcePath, atSeconds, out);
    return { path: out, probe: await probeImage(out) };
  });

  handle('avatars.addSegment', async (input) => {
    const { slug, sourcePath, inMs, outMs } = input as {
      slug: string;
      sourcePath: string;
      inMs: number;
      outMs: number;
    };
    const root = requireRoot();
    const segmentPath = path.resolve(
      projectDir(root, slug),
      'video',
      'segments',
      `${randomUUID()}.mp4`,
    );
    const extractResult = await extractSegment(sourcePath, inMs, outMs, segmentPath);
    logger.debug('avatars.addSegment', {
      sourcePath,
      inMs,
      outMs,
      reencoded: extractResult.reencoded,
    });
    const { segments } = openRepos(slug);
    return segments.create({ sourcePath, extractedPath: segmentPath, inMs, outMs });
  });

  handle('avatars.trainPhoto', async (input) => {
    const { slug, imagePath, name } = input as {
      slug: string;
      imagePath: string;
      name: string;
    };
    return submitTraining({ slug, tier: 'photo', name, sourcePaths: [imagePath] });
  });

  handle('avatars.trainInstant', async (input) => {
    const { slug, segmentIds, name } = input as {
      slug: string;
      segmentIds: number[];
      name: string;
    };
    const { segments } = openRepos(slug);
    const paths = segmentIds
      .map((id) => segments.get(id))
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => s.extractedPath);
    if (paths.length === 0) {
      throw new Error('No segments selected for Instant Avatar training.');
    }
    return submitTraining({ slug, tier: 'instant', name, sourcePaths: paths });
  });
}

function submitTraining(input: {
  slug: string;
  tier: AvatarTier;
  name: string;
  sourcePaths: readonly string[];
}): { avatar: ReturnType<AvatarsRepository['create']>; job: ReturnType<JobsRepository['create']> } {
  const root = requireRoot();
  const { avatars, jobs } = openRepos(input.slug);
  const avatar = avatars.create({
    tier: input.tier,
    sourceRef:
      input.tier === 'photo' ? (input.sourcePaths[0] ?? '') : JSON.stringify(input.sourcePaths),
    jobId: null,
  });
  const job = jobs.create({
    provider: 'heygen',
    kind: 'avatar_train',
    inputRef: JSON.stringify({
      avatarRowId: avatar.id,
      tier: input.tier,
      name: input.name,
      sourcePaths: input.sourcePaths,
    }),
  });
  void runNow('avatar_train', { jobId: job.id, projectsRoot: root, slug: input.slug }).catch(
    (err) => {
      logger.warn('avatars.train handler rejected', {
        jobId: job.id,
        avatarId: avatar.id,
        message: err instanceof Error ? err.message : String(err),
      });
    },
  );
  return { avatar, job };
}

function requireRoot(): string {
  const root = getSettings().projectsRoot;
  if (root === null) throw new Error('No projects root configured.');
  return root;
}

function openRepos(slug: string): {
  avatars: AvatarsRepository;
  segments: SegmentsRepository;
  jobs: JobsRepository;
} {
  const root = requireRoot();
  const db = openProjectDb({ projectsRoot: root, slug });
  return {
    avatars: new AvatarsRepository(db, root, slug),
    segments: new SegmentsRepository(db, root, slug),
    jobs: new JobsRepository(db, root, slug),
  };
}
