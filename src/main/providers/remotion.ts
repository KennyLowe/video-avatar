import { ProviderError } from '@shared/errors.js';

// Skeleton. Real implementation lands in Phase 6 T099.

function notImplemented(fn: string): never {
  throw new ProviderError({
    provider: 'remotion',
    code: 'not_implemented',
    message: `remotion.${fn} is not wired up in Phase 2.`,
  });
}

export async function bundleOnce(_entryTsx: string): Promise<string> {
  return notImplemented('bundleOnce');
}

export async function invalidateBundle(): Promise<void> {
  return notImplemented('invalidateBundle');
}

export interface RenderRequest {
  serveUrl: string;
  compositionId: string;
  inputProps: unknown;
  outputPath: string;
  codec: 'h264' | 'h265';
  jpegQuality?: number;
  crf: number;
  ffmpegPreset: 'veryfast' | 'medium' | 'slow';
  audioCodec: 'aac';
  audioBitrate: string;
  onProgress?: (p: { renderedFrames: number; totalFrames: number }) => void;
  signal?: AbortSignal;
}

export async function renderMedia(_r: RenderRequest): Promise<{ durationSeconds: number }> {
  return notImplemented('renderMedia');
}
