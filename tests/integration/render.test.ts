import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectElectronGate } from './_electronGate.js';

// T115 — render handler. Remotion's bundle + renderMedia are stubbed; the
// test asserts the handler's state machine around success, cancellation,
// and partial-file cleanup (FR-042).

const gate = detectElectronGate();

vi.mock('@main/platform/notifier.js', () => ({ notify: vi.fn() }));
vi.mock('@main/providers/remotion.js', () => ({
  bundleOnce: vi.fn(async () => 'http://localhost:12345/'),
  renderMedia: vi.fn(),
}));
vi.mock('@main/services/templateLoader.js', () => ({
  bundledRootPath: () => 'resources/templates/Root.tsx',
}));

describe.skipIf(!gate.loadable)('render handler', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-render-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  async function seed(projectName: string) {
    const { createProject } = await import('@main/data/projects.js');
    const { openProjectDb } = await import('@main/data/db.js');
    const { JobsRepository } = await import('@main/data/repositories/jobs.js');

    const project = createProject(tmpRoot, projectName);
    const db = openProjectDb({ projectsRoot: tmpRoot, slug: project.slug });
    const jobsRepo = new JobsRepository(db, tmpRoot, project.slug);
    const job = jobsRepo.create({
      provider: 'remotion',
      kind: 'render',
      inputRef: JSON.stringify({
        templateId: 'TitleSlide',
        props: { title: 'Hi', subtitle: 's' },
        settings: {
          resolution: '1080p30',
          codec: 'h264',
          preset: 'balanced',
          audioBitrate: '192k',
        },
        scriptId: null,
        slug: project.slug,
        title: 'Render Smoke',
      }),
      notifyOnComplete: false,
    });
    return { project, jobsRepo, job };
  }

  it('happy path: bundles + renders, persists render row, marks job done', async () => {
    const remotion = await import('@main/providers/remotion.js');
    const { runRender } = await import('@main/workers/handlers/render.js');
    const { closeAllProjectDbs } = await import('@main/data/db.js');

    const { project, jobsRepo, job } = await seed('render ok');
    vi.mocked(remotion.renderMedia).mockImplementation(async (req) => {
      writeFileSync(req.outputPath, Buffer.from([0x00, 0x00, 0x00, 0x18]));
      return { durationSeconds: 3 };
    });

    const result = await runRender({
      projectsRoot: tmpRoot,
      slug: project.slug,
      jobId: job.id,
      signal: new AbortController().signal,
    });
    expect(existsSync(result.outputPath)).toBe(true);
    expect(jobsRepo.get(job.id)?.status).toBe('done');

    closeAllProjectDbs();
  });

  it('cancellation: deletes partial file and marks job canceled', async () => {
    const remotion = await import('@main/providers/remotion.js');
    const { runRender } = await import('@main/workers/handlers/render.js');
    const { closeAllProjectDbs } = await import('@main/data/db.js');

    const { project, jobsRepo, job } = await seed('render cancel');
    const ctrl = new AbortController();
    vi.mocked(remotion.renderMedia).mockImplementation(async (req) => {
      writeFileSync(req.outputPath, Buffer.from([0x00]));
      ctrl.abort();
      throw Object.assign(new Error('Render was cancelled.'), { provider: 'remotion' });
    });

    await expect(
      runRender({
        projectsRoot: tmpRoot,
        slug: project.slug,
        jobId: job.id,
        signal: ctrl.signal,
      }),
    ).rejects.toThrow();

    const after = jobsRepo.get(job.id);
    expect(after?.status).toBe('canceled');
    // Partial file must be gone per FR-042.
    const dir = path.resolve(tmpRoot, project.slug, 'renders');
    expect(readdirSync(dir).filter((f) => f.endsWith('.mp4')).length).toBe(0);

    closeAllProjectDbs();
  });

  it('failure (not cancel): marks job failed with provider message', async () => {
    const remotion = await import('@main/providers/remotion.js');
    const { runRender } = await import('@main/workers/handlers/render.js');
    const { closeAllProjectDbs } = await import('@main/data/db.js');

    const { project, jobsRepo, job } = await seed('render fail');
    vi.mocked(remotion.renderMedia).mockRejectedValue(new Error('ffmpeg segfault'));

    await expect(
      runRender({
        projectsRoot: tmpRoot,
        slug: project.slug,
        jobId: job.id,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/ffmpeg segfault/);
    expect(jobsRepo.get(job.id)?.status).toBe('failed');
    expect(jobsRepo.get(job.id)?.error).toMatch(/ffmpeg segfault/);

    closeAllProjectDbs();
  });
});
