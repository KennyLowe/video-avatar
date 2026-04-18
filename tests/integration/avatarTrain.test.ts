import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectElectronGate } from './_electronGate.js';

// T097 — avatarTrain handler. Covers the Photo + Instant paths, ready/failed
// transitions, and best-effort remote cancellation on provider failure.

const gate = detectElectronGate();

vi.mock('@main/platform/notifier.js', () => ({ notify: vi.fn() }));
vi.mock('@main/providers/heygen.js', () => ({
  createPhotoAvatar: vi.fn(),
  createInstantAvatar: vi.fn(),
  getAvatarStatus: vi.fn(),
  cancelAvatarTraining: vi.fn(async () => undefined),
}));

describe.skipIf(!gate.loadable)('avatarTrain handler', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-avatrain-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  async function seed(projectName: string, tier: 'photo' | 'instant') {
    const { createProject } = await import('@main/data/projects.js');
    const { openProjectDb } = await import('@main/data/db.js');
    const { AvatarsRepository } = await import('@main/data/repositories/avatars.js');
    const { JobsRepository } = await import('@main/data/repositories/jobs.js');

    const project = createProject(tmpRoot, projectName);
    const db = openProjectDb({ projectsRoot: tmpRoot, slug: project.slug });
    const avatarsRepo = new AvatarsRepository(db, tmpRoot, project.slug);
    const jobsRepo = new JobsRepository(db, tmpRoot, project.slug);

    const srcPath = path.resolve(
      tmpRoot,
      project.slug,
      'video',
      'segments',
      tier === 'photo' ? 'face.png' : 'seg-1.mp4',
    );
    writeFileSync(srcPath, Buffer.from([0x00]));

    const avatar = avatarsRepo.create({ tier, sourceRef: srcPath, jobId: null });
    const job = jobsRepo.create({
      provider: 'heygen',
      kind: 'avatar_train',
      inputRef: JSON.stringify({
        avatarRowId: avatar.id,
        tier,
        name: `Avatar-${tier}`,
        sourcePaths: [srcPath],
      }),
      notifyOnComplete: false,
    });

    return { project, avatar, job, avatarsRepo, jobsRepo };
  }

  it('Photo: submits, polls until ready, marks avatar ready + job done', async () => {
    const heygen = await import('@main/providers/heygen.js');
    const { runAvatarTrain } = await import('@main/workers/handlers/avatarTrain.js');
    const { closeAllProjectDbs } = await import('@main/data/db.js');

    const { project, avatar, job, avatarsRepo, jobsRepo } = await seed('photo seed', 'photo');
    vi.mocked(heygen.createPhotoAvatar).mockResolvedValue({ avatarId: 'ph_1' });
    vi.mocked(heygen.getAvatarStatus).mockResolvedValue('ready');

    await runAvatarTrain({
      projectsRoot: tmpRoot,
      slug: project.slug,
      jobId: job.id,
      signal: new AbortController().signal,
    });
    expect(avatarsRepo.get(avatar.id)?.status).toBe('ready');
    expect(avatarsRepo.get(avatar.id)?.providerAvatarId).toBe('ph_1');
    expect(jobsRepo.get(job.id)?.status).toBe('done');

    closeAllProjectDbs();
  });

  it('Instant: submits, polls until ready', async () => {
    const heygen = await import('@main/providers/heygen.js');
    const { runAvatarTrain } = await import('@main/workers/handlers/avatarTrain.js');
    const { closeAllProjectDbs } = await import('@main/data/db.js');

    const { project, avatar, job, avatarsRepo } = await seed('instant seed', 'instant');
    vi.mocked(heygen.createInstantAvatar).mockResolvedValue({ avatarId: 'iv_1' });
    vi.mocked(heygen.getAvatarStatus).mockResolvedValue('ready');

    await runAvatarTrain({
      projectsRoot: tmpRoot,
      slug: project.slug,
      jobId: job.id,
      signal: new AbortController().signal,
    });
    expect(avatarsRepo.get(avatar.id)?.providerAvatarId).toBe('iv_1');

    closeAllProjectDbs();
  });

  it('cancels remote training on provider failure', async () => {
    const heygen = await import('@main/providers/heygen.js');
    const { runAvatarTrain } = await import('@main/workers/handlers/avatarTrain.js');
    const { JobsRepository } = await import('@main/data/repositories/jobs.js');
    const { closeAllProjectDbs, openProjectDb } = await import('@main/data/db.js');

    const { project, avatar, job, avatarsRepo } = await seed('fail seed', 'photo');
    vi.mocked(heygen.createPhotoAvatar).mockResolvedValue({ avatarId: 'ph_fail' });
    vi.mocked(heygen.getAvatarStatus).mockResolvedValue('failed');

    await expect(
      runAvatarTrain({
        projectsRoot: tmpRoot,
        slug: project.slug,
        jobId: job.id,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/avatar training failure/i);
    expect(avatarsRepo.get(avatar.id)?.status).toBe('failed');
    // Best-effort cancel should have been attempted on the provider id.
    expect(heygen.cancelAvatarTraining).toHaveBeenCalledWith('ph_fail');

    const db = openProjectDb({ projectsRoot: tmpRoot, slug: project.slug });
    const jobsRepo = new JobsRepository(db, tmpRoot, project.slug);
    expect(jobsRepo.get(job.id)?.status).toBe('failed');

    closeAllProjectDbs();
  });
});
