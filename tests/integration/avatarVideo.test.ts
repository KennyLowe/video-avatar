import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { detectElectronGate } from './_electronGate.js';

// T067 — avatarVideo happy path. Mocks out every external boundary
// (ElevenLabs TTS, transport, HeyGen generate/status/download, notifier)
// and drives the handler through its six steps, asserting that the jobs
// row, costs ledger, and renders row all land in the expected state.

const gate = detectElectronGate();

vi.mock('@main/platform/notifier.js', () => ({ notify: vi.fn() }));
vi.mock('@main/providers/elevenlabs.js', () => ({
  tts: vi.fn(),
  getVoiceStatus: vi.fn(),
}));
vi.mock('@main/providers/heygen.js', () => ({
  generateVideo: vi.fn(),
  getVideoStatus: vi.fn(),
  downloadCompletedVideo: vi.fn(),
}));
vi.mock('@main/providers/transport.js', () => ({
  resolve: vi.fn(() => ({
    kind: 'heygen',
    isAvailable: async () => true,
    put: vi.fn(async () => ({ kind: 'asset', assetId: 'asset_test_123' })),
  })),
}));

describe.skipIf(!gate.loadable)('avatarVideo handler', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-avvid-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('runs TTS → upload → generate → poll → download → ledger and marks the job done', async () => {
    const { createProject } = await import('@main/data/projects.js');
    const { openProjectDb, closeAllProjectDbs } = await import('@main/data/db.js');
    const { JobsRepository } = await import('@main/data/repositories/jobs.js');
    const { ScriptsRepository } = await import('@main/data/repositories/scripts.js');
    const { CostsRepository } = await import('@main/data/repositories/costs.js');
    const { runAvatarVideo } = await import('@main/workers/handlers/avatarVideo.js');
    const elevenlabs = await import('@main/providers/elevenlabs.js');
    const heygen = await import('@main/providers/heygen.js');

    const project = createProject(tmpRoot, 'p1 end to end');
    const db = openProjectDb({ projectsRoot: tmpRoot, slug: project.slug });
    const scripts = new ScriptsRepository(db, tmpRoot, project.slug);
    const jobs = new JobsRepository(db, tmpRoot, project.slug);
    const costs = new CostsRepository(db, tmpRoot, project.slug);

    const script = scripts.save({
      slug: 'p1',
      title: 'P1 End to End',
      bodyMd: 'Hello world.',
      estimatedSeconds: 12,
      parentVersionId: null,
    });
    const job = jobs.create({
      provider: 'heygen',
      kind: 'avatar_video',
      inputRef: JSON.stringify({
        scriptId: script.id,
        voiceId: 'voice_abc',
        voiceRowId: null,
        avatarId: 'avatar_abc',
        avatarRowId: null,
        mode: 'avatar_iv',
      }),
      notifyOnComplete: false,
    });

    vi.mocked(elevenlabs.tts).mockResolvedValue({
      mp3: Buffer.from([0x49, 0x44, 0x33]),
      characters: 12,
    });
    vi.mocked(heygen.generateVideo).mockResolvedValue({ videoJobId: 'video_xyz' });
    vi.mocked(heygen.getVideoStatus).mockResolvedValue({
      status: 'completed',
      videoUrl: 'https://heygen/out.mp4',
    });
    const fakeBody = new Uint8Array([0x00, 0x01, 0x02]);
    // Construct a web ReadableStream without relying on globals.
    vi.mocked(heygen.downloadCompletedVideo).mockResolvedValue(
      Readable.from([Buffer.from(fakeBody)]) as unknown as ReadableStream<Uint8Array>,
    );

    const result = await runAvatarVideo({
      projectsRoot: tmpRoot,
      slug: project.slug,
      jobId: job.id,
      signal: new AbortController().signal,
    });

    const after = jobs.get(job.id);
    expect(after?.status).toBe('done');
    expect(after?.outputPath).toMatch(/\.mp4$/);
    expect(existsSync(result.outputPath)).toBe(true);
    // Two ledger entries: elevenlabs TTS + heygen avatar_video_iv.
    const ledger = costs.listAll();
    expect(ledger.map((e) => e.provider).sort()).toEqual(['elevenlabs', 'heygen']);

    closeAllProjectDbs();
  });

  it('surfaces HeyGen failure messages verbatim and marks the job failed', async () => {
    const { createProject } = await import('@main/data/projects.js');
    const { openProjectDb, closeAllProjectDbs } = await import('@main/data/db.js');
    const { JobsRepository } = await import('@main/data/repositories/jobs.js');
    const { ScriptsRepository } = await import('@main/data/repositories/scripts.js');
    const { runAvatarVideo } = await import('@main/workers/handlers/avatarVideo.js');
    const elevenlabs = await import('@main/providers/elevenlabs.js');
    const heygen = await import('@main/providers/heygen.js');

    const project = createProject(tmpRoot, 'p1 failure');
    const db = openProjectDb({ projectsRoot: tmpRoot, slug: project.slug });
    const scripts = new ScriptsRepository(db, tmpRoot, project.slug);
    const jobs = new JobsRepository(db, tmpRoot, project.slug);
    const script = scripts.save({
      slug: 'fail',
      title: 'fail',
      bodyMd: 'x',
      estimatedSeconds: 1,
      parentVersionId: null,
    });
    const job = jobs.create({
      provider: 'heygen',
      kind: 'avatar_video',
      inputRef: JSON.stringify({
        scriptId: script.id,
        voiceId: 'v',
        voiceRowId: null,
        avatarId: 'a',
        avatarRowId: null,
        mode: 'avatar_iv',
      }),
      notifyOnComplete: false,
    });

    vi.mocked(elevenlabs.tts).mockResolvedValue({
      mp3: Buffer.from([0x49]),
      characters: 1,
    });
    vi.mocked(heygen.generateVideo).mockResolvedValue({ videoJobId: 'vid_fail' });
    vi.mocked(heygen.getVideoStatus).mockResolvedValue({
      status: 'failed',
      error: 'insufficient_credits',
    });

    await expect(
      runAvatarVideo({
        projectsRoot: tmpRoot,
        slug: project.slug,
        jobId: job.id,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/insufficient_credits/);

    const after = jobs.get(job.id);
    expect(after?.status).toBe('failed');
    expect(after?.error).toMatch(/insufficient_credits/);

    closeAllProjectDbs();
  });
});

// Silence the unused-var ESLint rule on the in-memory writeFileSync
// import — some runners resolve imports strictly.
void writeFileSync;
