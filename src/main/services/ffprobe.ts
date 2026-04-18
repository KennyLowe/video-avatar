import { spawn } from 'node:child_process';
import ffprobePathImport from 'ffprobe-static';

// ffprobe sidecar. ffprobe-static resolves to a bundled static binary.
// Like ffmpeg, we handle the app.asar → app.asar.unpacked path rewrite here.

const raw = (ffprobePathImport as { path?: string; default?: string } | string | undefined) ?? '';
const ffprobeResolved = typeof raw === 'string' ? raw : (raw.path ?? raw.default ?? '');
const ffprobePath = ffprobeResolved.replace('app.asar', 'app.asar.unpacked');

export interface VideoProbe {
  durationSeconds: number;
  widthPx: number;
  heightPx: number;
  fps: number;
  codec: string;
  sizeBytes: number;
}

export interface ImageProbe {
  widthPx: number;
  heightPx: number;
  codec: string;
  sizeBytes: number;
}

interface RawProbe {
  format?: { duration?: string; size?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    avg_frame_rate?: string;
  }>;
}

async function runFfprobe(args: readonly string[]): Promise<string> {
  if (ffprobePath.length === 0) {
    throw new Error('ffprobe-static did not resolve to a binary on this platform.');
  }
  return new Promise((resolve, reject) => {
    const child = spawn(ffprobePath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (c: string) => {
      stdout += c;
    });
    child.stderr.on('data', (c: string) => {
      stderr += c;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffprobe exited ${code}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function parseFrameRate(rate: string | undefined): number {
  if (!rate) return 0;
  const [num, den] = rate.split('/').map((n) => Number.parseFloat(n));
  if (num === undefined || den === undefined || den === 0) return 0;
  return num / den;
}

export async function probeVideo(inputPath: string): Promise<VideoProbe> {
  const stdout = await runFfprobe([
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ]);
  const parsed = JSON.parse(stdout) as RawProbe;
  const videoStream = (parsed.streams ?? []).find((s) => s.codec_type === 'video');
  return {
    durationSeconds: Number.parseFloat(parsed.format?.duration ?? '0'),
    widthPx: videoStream?.width ?? 0,
    heightPx: videoStream?.height ?? 0,
    fps: parseFrameRate(videoStream?.r_frame_rate ?? videoStream?.avg_frame_rate),
    codec: videoStream?.codec_name ?? 'unknown',
    sizeBytes: Number.parseInt(parsed.format?.size ?? '0', 10),
  };
}

export async function probeImage(inputPath: string): Promise<ImageProbe> {
  const stdout = await runFfprobe([
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ]);
  const parsed = JSON.parse(stdout) as RawProbe;
  const stream =
    (parsed.streams ?? []).find((s) => s.codec_type === 'video') ?? parsed.streams?.[0];
  return {
    widthPx: stream?.width ?? 0,
    heightPx: stream?.height ?? 0,
    codec: stream?.codec_name ?? 'unknown',
    sizeBytes: Number.parseInt(parsed.format?.size ?? '0', 10),
  };
}
