import { writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { handle } from './index.js';
import { getSettings } from '@main/platform/settings.js';
import { openProjectDb } from '@main/data/db.js';
import { TakesRepository } from '@main/data/repositories/takes.js';
import { VoicesRepository } from '@main/data/repositories/voices.js';
import { JobsRepository } from '@main/data/repositories/jobs.js';
import { projectDir } from '@main/platform/paths.js';
import * as elevenlabs from '@main/providers/elevenlabs.js';
import {
  writeAndNormalise,
  normaliseAudioToWav,
  probeDurationSeconds,
} from '@main/services/ffmpeg.js';
import { runNow } from '@main/workers/jobQueue.js';
import { logger } from '@main/logging/jsonl.js';
import type { VoiceTier } from '@shared/schemas/voice.js';

// voices.* IPC surface per FR-015..FR-022.
// Recording happens in the renderer (MediaRecorder + Web Audio API); the
// bytes arrive here via voices.saveRecording and we normalise into the
// internal 48 kHz mono 24-bit WAV format. Import follows the same path
// with an input file on disk instead.

export function registerVoicesIpc(): void {
  handle('voices.list', async (input) => {
    const { slug } = input as { slug: string };
    const { voices } = openRepos(slug);
    return voices.list();
  });

  handle('voices.listTakes', async (input) => {
    const { slug } = input as { slug: string };
    const { takes } = openRepos(slug);
    return { takes: takes.list(), goodSeconds: takes.goodSecondsTotal() };
  });

  // The renderer recorded a Blob and encoded its bytes into a base64 string
  // (Uint8Array is not structured-cloneable through contextBridge on every
  // Electron version, and base64 is a 33% overhead we can live with for a
  // handful-of-minutes voice take).
  handle('voices.saveRecording', async (input) => {
    const { slug, bytesBase64, sourceExtension } = input as {
      slug: string;
      bytesBase64: string;
      sourceExtension: string;
    };
    const root = requireRoot();
    const takesDir = path.resolve(projectDir(root, slug), 'audio', 'takes');
    const outputWav = path.resolve(takesDir, `${randomUUID()}.wav`);
    await writeAndNormalise(Buffer.from(bytesBase64, 'base64'), sourceExtension, outputWav);
    const durationSeconds = Math.max(1, Math.round(await probeDurationSeconds(outputWav)));
    const { takes } = openRepos(slug);
    return takes.create({ path: outputWav, source: 'record', durationSeconds });
  });

  handle('voices.importFile', async (input) => {
    const { slug, sourcePath } = input as { slug: string; sourcePath: string };
    const root = requireRoot();
    const takesDir = path.resolve(projectDir(root, slug), 'audio', 'takes');
    const outputWav = path.resolve(takesDir, `${randomUUID()}.wav`);
    await normaliseAudioToWav(sourcePath, outputWav);
    const durationSeconds = Math.max(1, Math.round(await probeDurationSeconds(outputWav)));
    const { takes } = openRepos(slug);
    return takes.create({ path: outputWav, source: 'import', durationSeconds });
  });

  handle('voices.markTake', async (input) => {
    const { slug, takeId, mark } = input as {
      slug: string;
      takeId: number;
      mark: 'good' | 'bad' | 'unmarked';
    };
    const { takes } = openRepos(slug);
    return takes.mark(takeId, mark);
  });

  handle('voices.trimTake', async (input) => {
    const { slug, takeId, inMs, outMs } = input as {
      slug: string;
      takeId: number;
      inMs: number;
      outMs: number;
    };
    const { takes } = openRepos(slug);
    return takes.trim(takeId, inMs, outMs);
  });

  handle('voices.deleteTake', async (input) => {
    const { slug, takeId } = input as { slug: string; takeId: number };
    const { takes } = openRepos(slug);
    takes.remove(takeId);
  });

  handle('voices.minimums', async () => ({
    pvcSeconds: await elevenlabs.getPvcMinimumSeconds(),
    ivcSeconds: await elevenlabs.getIvcMinimumSeconds(),
  }));

  handle('voices.train', async (input) => {
    const { slug, name, tier } = input as { slug: string; name: string; tier: VoiceTier };
    const root = requireRoot();
    const { takes, voices, jobs } = openRepos(slug);
    const good = takes.listGood();
    if (good.length === 0) {
      throw new Error('No good takes — mark at least one take as good first.');
    }
    const minimums =
      tier === 'pvc'
        ? await elevenlabs.getPvcMinimumSeconds()
        : await elevenlabs.getIvcMinimumSeconds();
    const goodSeconds = takes.goodSecondsTotal();
    if (goodSeconds < minimums) {
      throw new Error(
        `Need ${Math.ceil(minimums / 60)} minutes of good audio for ${tier.toUpperCase()}; have ${Math.floor(goodSeconds / 60)}m ${Math.floor(goodSeconds % 60)}s.`,
      );
    }
    const voice = voices.create({
      tier,
      name,
      sampleSeconds: Math.round(goodSeconds),
      jobId: null,
    });
    const job = jobs.create({
      provider: 'elevenlabs',
      kind: 'voice_train',
      inputRef: JSON.stringify({
        voiceRowId: voice.id,
        tier,
        name,
        takeIds: good.map((t) => t.id),
      }),
    });
    // Wire up fire-and-forget handler execution; runNow resolves after the
    // handler completes (or rejects). We log on failure; the voices row
    // status is already updated by the handler itself.
    void runNow('voice_train', { jobId: job.id, projectsRoot: root, slug }).catch((err) => {
      logger.warn('voices.train handler rejected', {
        jobId: job.id,
        voiceId: voice.id,
        message: err instanceof Error ? err.message : String(err),
      });
    });
    return { voice, job };
  });

  handle('voices.preview', async (input) => {
    const { slug, voiceId, text } = input as {
      slug: string;
      voiceId: string;
      text: string;
    };
    const root = requireRoot();
    // Short-circuit excessive preview lengths — operators occasionally paste a
    // full script by mistake. Preview is meant to be ~10 seconds of speech.
    const trimmed = text.trim().slice(0, 500);
    const { mp3 } = await elevenlabs.tts({ voiceId, text: trimmed });
    const previewPath = path.resolve(
      projectDir(root, slug),
      'audio',
      'tts',
      `preview-${randomUUID()}.mp3`,
    );
    writeFileSync(previewPath, mp3);
    return { mp3Path: previewPath };
  });
}

function requireRoot(): string {
  const root = getSettings().projectsRoot;
  if (root === null) throw new Error('No projects root configured.');
  return root;
}

function openRepos(slug: string): {
  takes: TakesRepository;
  voices: VoicesRepository;
  jobs: JobsRepository;
} {
  const root = requireRoot();
  const db = openProjectDb({ projectsRoot: root, slug });
  return {
    takes: new TakesRepository(db, root, slug),
    voices: new VoicesRepository(db, root, slug),
    jobs: new JobsRepository(db, root, slug),
  };
}
