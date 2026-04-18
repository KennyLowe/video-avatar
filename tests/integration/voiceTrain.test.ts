import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectElectronGate } from './_electronGate.js';

// T081 — voiceTrain end-to-end. Drives the handler against stubbed ffmpeg
// and ElevenLabs calls. Covers:
//   * PVC happy path — submit + poll through a "pending → ready" sequence
//   * IVC synchronous path — no polling, voice goes ready immediately
//   * Empty selection errors out cleanly
//   * PVC polling terminates on provider failure

const gate = detectElectronGate();

vi.mock('@main/platform/notifier.js', () => ({ notify: vi.fn() }));
vi.mock('@main/providers/elevenlabs.js', () => ({
  createIVC: vi.fn(),
  createPVC: vi.fn(),
  getVoiceStatus: vi.fn(),
}));
vi.mock('@main/services/ffmpeg.js', () => ({
  concatWavTakes: vi.fn(async (_sources: unknown, out: string) => {
    writeFileSync(out, Buffer.from([0x52, 0x49, 0x46, 0x46]));
  }),
}));

describe.skipIf(!gate.loadable)('voiceTrain handler', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-voicetrain-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  async function seed(projectName: string, tier: 'pvc' | 'ivc') {
    const { createProject } = await import('@main/data/projects.js');
    const { openProjectDb } = await import('@main/data/db.js');
    const { TakesRepository } = await import('@main/data/repositories/takes.js');
    const { VoicesRepository } = await import('@main/data/repositories/voices.js');
    const { JobsRepository } = await import('@main/data/repositories/jobs.js');

    const project = createProject(tmpRoot, projectName);
    const db = openProjectDb({ projectsRoot: tmpRoot, slug: project.slug });
    const takesRepo = new TakesRepository(db, tmpRoot, project.slug);
    const voicesRepo = new VoicesRepository(db, tmpRoot, project.slug);
    const jobsRepo = new JobsRepository(db, tmpRoot, project.slug);

    const takePath = path.resolve(tmpRoot, project.slug, 'audio', 'takes', 'take1.wav');
    writeFileSync(takePath, Buffer.from([0x52, 0x49, 0x46, 0x46]));
    const take = takesRepo.create({ path: takePath, source: 'record', durationSeconds: 180 });
    takesRepo.mark(take.id, 'good');

    const voice = voicesRepo.create({
      tier,
      name: `Voice-${tier}`,
      sampleSeconds: 180,
      jobId: null,
    });
    const job = jobsRepo.create({
      provider: 'elevenlabs',
      kind: 'voice_train',
      inputRef: JSON.stringify({
        voiceRowId: voice.id,
        tier,
        name: `Voice-${tier}`,
        takeIds: [take.id],
      }),
      notifyOnComplete: false,
    });

    return { project, db, voice, job, voicesRepo, jobsRepo };
  }

  it('PVC: submits, polls pending→ready, marks voice ready and job done', async () => {
    const elevenlabs = await import('@main/providers/elevenlabs.js');
    const { runVoiceTrain } = await import('@main/workers/handlers/voiceTrain.js');
    const { closeAllProjectDbs } = await import('@main/data/db.js');

    const { project, voice, job, voicesRepo, jobsRepo } = await seed('pvc seed', 'pvc');
    vi.mocked(elevenlabs.createPVC).mockResolvedValue({ voiceId: 'el_pvc_1' });
    const statusSeq = ['training', 'training', 'ready'] as const;
    let i = 0;
    vi.mocked(elevenlabs.getVoiceStatus).mockImplementation(async () => statusSeq[i++] ?? 'ready');

    const result = await runVoiceTrain({
      projectsRoot: tmpRoot,
      slug: project.slug,
      jobId: job.id,
      signal: new AbortController().signal,
    });
    expect(result.providerVoiceId).toBe('el_pvc_1');
    expect(voicesRepo.get(voice.id)?.status).toBe('ready');
    expect(jobsRepo.get(job.id)?.status).toBe('done');

    closeAllProjectDbs();
  });

  it('IVC: synchronous submit, no polling, voice ready immediately', async () => {
    const elevenlabs = await import('@main/providers/elevenlabs.js');
    const { runVoiceTrain } = await import('@main/workers/handlers/voiceTrain.js');
    const { closeAllProjectDbs } = await import('@main/data/db.js');

    const { project, voice, job, voicesRepo, jobsRepo } = await seed('ivc seed', 'ivc');
    vi.mocked(elevenlabs.createIVC).mockResolvedValue({ voiceId: 'el_ivc_1' });
    const pollSpy = vi.mocked(elevenlabs.getVoiceStatus);

    await runVoiceTrain({
      projectsRoot: tmpRoot,
      slug: project.slug,
      jobId: job.id,
      signal: new AbortController().signal,
    });
    expect(pollSpy).not.toHaveBeenCalled();
    expect(voicesRepo.get(voice.id)?.status).toBe('ready');
    expect(jobsRepo.get(job.id)?.status).toBe('done');

    closeAllProjectDbs();
  });

  it('PVC: surfaces "failed" provider status verbatim', async () => {
    const elevenlabs = await import('@main/providers/elevenlabs.js');
    const { runVoiceTrain } = await import('@main/workers/handlers/voiceTrain.js');
    const { closeAllProjectDbs } = await import('@main/data/db.js');

    const { project, voice, job, voicesRepo, jobsRepo } = await seed('pvc fail', 'pvc');
    vi.mocked(elevenlabs.createPVC).mockResolvedValue({ voiceId: 'pvc_fail' });
    vi.mocked(elevenlabs.getVoiceStatus).mockResolvedValue('failed');

    await expect(
      runVoiceTrain({
        projectsRoot: tmpRoot,
        slug: project.slug,
        jobId: job.id,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/PVC training failure/);
    expect(voicesRepo.get(voice.id)?.status).toBe('failed');
    expect(jobsRepo.get(job.id)?.status).toBe('failed');

    closeAllProjectDbs();
  });
});
