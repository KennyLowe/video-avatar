import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectElectronGate } from './_electronGate.js';

// T068 — resumability invariant. Simulate a crash by seeding the DB with a
// `running` job whose `providerJobId` is set, then drive the reconciler with
// stub provider status functions and assert the job row lands in the expected
// terminal state.

const gate = detectElectronGate();

vi.mock('@main/platform/settings.js', () => ({
  getSettings: (): { projectsRoot: string | null } => ({ projectsRoot: null }),
}));

describe.skipIf(!gate.loadable)('reconciler resumability', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-recon-'));
    const { __resetForTests } = await import('@main/workers/reconciler.js');
    __resetForTests();
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('marks a HeyGen video running→failed when provider reports completion (needs re-download)', async () => {
    const { openProjectDb, closeAllProjectDbs } = await import('@main/data/db.js');
    const { JobsRepository } = await import('@main/data/repositories/jobs.js');
    const { reconcileOnLaunch } = await import('@main/workers/reconciler.js');
    const { createProject } = await import('@main/data/projects.js');

    const project = createProject(tmpRoot, 'recon test');
    const db = openProjectDb({ projectsRoot: tmpRoot, slug: project.slug });
    const jobs = new JobsRepository(db, tmpRoot, project.slug);
    const seeded = jobs.create({
      provider: 'heygen',
      kind: 'avatar_video',
      inputRef: JSON.stringify({ scriptId: 1 }),
      notifyOnComplete: false,
    });
    jobs.updateStatus(seeded.id, { status: 'running', providerJobId: 'video_abc' });

    const getVideoStatus = vi.fn().mockResolvedValue({
      status: 'completed',
      videoUrl: 'https://heygen/v/out.mp4',
    });

    await reconcileOnLaunch({
      fetchProjects: () => [project.slug],
      openDb: (slug) => openProjectDb({ projectsRoot: tmpRoot, slug }),
      getVideoStatus,
      getAvatarStatus: vi.fn(),
      getVoiceStatus: vi.fn(),
    });

    expect(getVideoStatus).toHaveBeenCalledWith('video_abc');
    const after = jobs.get(seeded.id);
    expect(after?.status).toBe('failed');
    expect(after?.error).toMatch(/never downloaded/i);

    closeAllProjectDbs();
  });

  it('leaves still-running HeyGen video jobs as running', async () => {
    const { openProjectDb, closeAllProjectDbs } = await import('@main/data/db.js');
    const { JobsRepository } = await import('@main/data/repositories/jobs.js');
    const { reconcileOnLaunch } = await import('@main/workers/reconciler.js');
    const { createProject } = await import('@main/data/projects.js');

    const project = createProject(tmpRoot, 'still running');
    const db = openProjectDb({ projectsRoot: tmpRoot, slug: project.slug });
    const jobs = new JobsRepository(db, tmpRoot, project.slug);
    const seeded = jobs.create({
      provider: 'heygen',
      kind: 'avatar_video',
      inputRef: JSON.stringify({ scriptId: 1 }),
      notifyOnComplete: false,
    });
    jobs.updateStatus(seeded.id, { status: 'running', providerJobId: 'video_still' });

    await reconcileOnLaunch({
      fetchProjects: () => [project.slug],
      openDb: (slug) => openProjectDb({ projectsRoot: tmpRoot, slug }),
      getVideoStatus: vi.fn().mockResolvedValue({ status: 'pending' }),
      getAvatarStatus: vi.fn(),
      getVoiceStatus: vi.fn(),
    });

    const after = jobs.get(seeded.id);
    expect(after?.status).toBe('running');

    closeAllProjectDbs();
  });

  it('fails a running job that has no providerJobId — crashed pre-submission', async () => {
    const { openProjectDb, closeAllProjectDbs } = await import('@main/data/db.js');
    const { JobsRepository } = await import('@main/data/repositories/jobs.js');
    const { reconcileOnLaunch } = await import('@main/workers/reconciler.js');
    const { createProject } = await import('@main/data/projects.js');

    const project = createProject(tmpRoot, 'pre submit crash');
    const db = openProjectDb({ projectsRoot: tmpRoot, slug: project.slug });
    const jobs = new JobsRepository(db, tmpRoot, project.slug);
    const seeded = jobs.create({
      provider: 'heygen',
      kind: 'avatar_video',
      inputRef: JSON.stringify({ scriptId: 1 }),
      notifyOnComplete: false,
    });
    jobs.updateStatus(seeded.id, { status: 'running' });

    await reconcileOnLaunch({
      fetchProjects: () => [project.slug],
      openDb: (slug) => openProjectDb({ projectsRoot: tmpRoot, slug }),
      getVideoStatus: vi.fn(),
      getAvatarStatus: vi.fn(),
      getVoiceStatus: vi.fn(),
    });

    const after = jobs.get(seeded.id);
    expect(after?.status).toBe('failed');
    expect(after?.error).toMatch(/no provider id/i);

    closeAllProjectDbs();
  });

  it('marks a PVC voice ready when ElevenLabs reports ready', async () => {
    const { openProjectDb, closeAllProjectDbs } = await import('@main/data/db.js');
    const { JobsRepository } = await import('@main/data/repositories/jobs.js');
    const { reconcileOnLaunch } = await import('@main/workers/reconciler.js');
    const { createProject } = await import('@main/data/projects.js');

    const project = createProject(tmpRoot, 'pvc ready');
    const db = openProjectDb({ projectsRoot: tmpRoot, slug: project.slug });
    const jobs = new JobsRepository(db, tmpRoot, project.slug);
    const seeded = jobs.create({
      provider: 'elevenlabs',
      kind: 'voice_train',
      inputRef: JSON.stringify({ voiceRowId: 1 }),
      notifyOnComplete: false,
    });
    jobs.updateStatus(seeded.id, { status: 'running', providerJobId: 'voice_xyz' });

    await reconcileOnLaunch({
      fetchProjects: () => [project.slug],
      openDb: (slug) => openProjectDb({ projectsRoot: tmpRoot, slug }),
      getVideoStatus: vi.fn(),
      getAvatarStatus: vi.fn(),
      getVoiceStatus: vi.fn().mockResolvedValue('ready'),
    });

    const after = jobs.get(seeded.id);
    expect(after?.status).toBe('done');

    closeAllProjectDbs();
  });

  it('is idempotent — a second call performs no additional status calls', async () => {
    const { openProjectDb, closeAllProjectDbs } = await import('@main/data/db.js');
    const { reconcileOnLaunch, __resetForTests } = await import('@main/workers/reconciler.js');

    __resetForTests();
    const getVideoStatus = vi.fn();
    await reconcileOnLaunch({
      fetchProjects: () => [],
      openDb: (slug) => openProjectDb({ projectsRoot: tmpRoot, slug }),
      getVideoStatus,
      getAvatarStatus: vi.fn(),
      getVoiceStatus: vi.fn(),
    });
    await reconcileOnLaunch({
      fetchProjects: () => ['never-called'],
      openDb: (slug) => openProjectDb({ projectsRoot: tmpRoot, slug }),
      getVideoStatus,
      getAvatarStatus: vi.fn(),
      getVoiceStatus: vi.fn(),
    });
    expect(getVideoStatus).not.toHaveBeenCalled();

    closeAllProjectDbs();
  });
});
