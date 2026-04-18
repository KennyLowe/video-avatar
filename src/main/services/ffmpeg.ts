import { spawn } from 'node:child_process';
import { createWriteStream, writeFileSync, mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import ffmpegPathImport from 'ffmpeg-static';
import { logger } from '@main/logging/jsonl.js';

// ffmpeg sidecar. We use the prebuilt static binary via ffmpeg-static; the
// postinstall of electron-builder already arranges for it to be unpacked
// alongside the app when packaged.
//
// Every invocation funnels through `runFfmpeg` so stderr capture, timeouts,
// and structured logging are consistent.

// ffmpeg-static exports the resolved path as its default; on Electron-packaged
// apps we need to rewrite app.asar → app.asar.unpacked (handled via
// extraResources in electron-builder.yml).
const ffmpegPath = resolveFfmpegPath(ffmpegPathImport);

function resolveFfmpegPath(raw: string | null): string {
  if (raw === null) {
    throw new Error('ffmpeg-static did not resolve to a binary on this platform.');
  }
  // In a packaged Electron app the module's path sits inside app.asar; the
  // actual file lives in app.asar.unpacked. Normalising here avoids that
  // hazard at every call site.
  return raw.replace('app.asar', 'app.asar.unpacked');
}

interface RunOptions {
  args: readonly string[];
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function runFfmpeg(opts: RunOptions): Promise<{ stdout: string; stderr: string }> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, opts.args, { windowsHide: true });
    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1_000).unref();
      reject(new Error('ffmpeg aborted'));
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (c: string) => {
      stdoutBuf += c;
    });
    child.stderr.on('data', (c: string) => {
      stderrBuf += c;
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (code !== 0) {
        logger.warn('ffmpeg.nonzero_exit', { args: opts.args, stderr: stderrBuf.slice(-2000) });
        reject(new Error(stderrBuf.trim() || `ffmpeg exited ${code}`));
        return;
      }
      resolve({ stdout: stdoutBuf, stderr: stderrBuf });
    });
  });
}

// --- public helpers -----------------------------------------------------

/** Normalise an input audio file into 48 kHz mono 24-bit WAV. */
export async function normaliseAudioToWav(input: string, output: string): Promise<void> {
  await runFfmpeg({
    args: [
      '-y',
      '-i',
      input,
      '-ac',
      '1',
      '-ar',
      '48000',
      '-sample_fmt',
      's32',
      '-c:a',
      'pcm_s24le',
      output,
    ],
  });
}

/**
 * Concatenate WAV takes with optional trim offsets into a single WAV. Inputs
 * are assumed to already be 48 kHz mono 24-bit (i.e. post-normalise).
 *
 * `trimStartMs` / `trimEndMs` on each item clip the audio at source; pass
 * 0 / duration for an untrimmed take.
 */
export interface ConcatInput {
  path: string;
  trimStartMs: number;
  trimEndMs: number;
}

export async function concatWavTakes(
  inputs: readonly ConcatInput[],
  output: string,
): Promise<void> {
  if (inputs.length === 0) {
    throw new Error('concatWavTakes called with no inputs');
  }
  // Build a concat demuxer file with explicit `inpoint` / `outpoint` directives
  // for takes that specify trims. The concat demuxer handles sample-accurate
  // cuts for WAV.
  const tmp = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-concat-'));
  const listPath = path.resolve(tmp, 'takes.txt');
  const lines = inputs.map((i) => {
    const safe = i.path.replace(/'/g, `'\\''`);
    const inPoint = i.trimStartMs > 0 ? `\ninpoint ${(i.trimStartMs / 1000).toFixed(3)}` : '';
    const outPoint = i.trimEndMs > 0 ? `\noutpoint ${(i.trimEndMs / 1000).toFixed(3)}` : '';
    return `file '${safe}'${inPoint}${outPoint}`;
  });
  writeFileSync(listPath, lines.join('\n'), 'utf-8');

  await runFfmpeg({
    args: ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', output],
  });
}

/** Write a raw buffer (typically a MediaRecorder Blob's bytes) to disk,
 *  then normalise it into the recording format at the provided output path.
 *  Used by the IPC handler that receives bytes from the renderer.
 */
export async function writeAndNormalise(
  bytes: Buffer,
  sourceExtension: string,
  outputWav: string,
): Promise<void> {
  const tmp = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-rec-'));
  const tmpPath = path.resolve(tmp, `raw.${sourceExtension.replace(/^\./, '')}`);
  writeFileSync(tmpPath, bytes);
  await normaliseAudioToWav(tmpPath, outputWav);
}

/** Duration probe for a single media file. Uses ffmpeg's -f null output
 *  trick because we ship ffmpeg (not ffprobe) as the canonical sidecar.
 *  Returned duration is in seconds with one decimal of precision.
 */
export async function probeDurationSeconds(input: string): Promise<number> {
  const { stderr } = await runFfmpeg({
    args: ['-i', input, '-f', 'null', '-'],
  });
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!match) return 0;
  const [, h, m, s] = match;
  const hh = Number.parseInt(h ?? '0', 10);
  const mm = Number.parseInt(m ?? '0', 10);
  const ss = Number.parseFloat(s ?? '0');
  return hh * 3_600 + mm * 60 + ss;
}

/** Tear-off for tests that want to pipe ffmpeg's stdout directly. */
export function spawnFfmpeg(args: readonly string[]): ReturnType<typeof spawn> {
  return spawn(ffmpegPath, args, { windowsHide: true });
}

/** Exposed for integration tests — not used by production code. */
export function __ffmpegPathForTests(): string {
  return ffmpegPath;
}

// Intentionally unused in production; kept so IDEs don't strip the import.
export const __writeStreamTie = createWriteStream;
