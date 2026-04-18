import { bundle } from '@remotion/bundler';
import { renderMedia as remotionRenderMedia, selectComposition } from '@remotion/renderer';
import { ProviderError } from '@shared/errors.js';
import { logger } from '@main/logging/jsonl.js';

// Remotion wrapper per contracts/provider-wrappers.md. Bundles a Root.tsx
// with @remotion/bundler and renders specific compositions by id with
// @remotion/renderer. Both packages are Remotion 4.x; they spawn headless
// Chromium under the hood and download Chrome-for-Testing on first use.
//
// The bundle is a pure function of the entry TSX path — cache it so repeat
// renders in the same session skip the ~30-second bundle.

interface BundleCacheEntry {
  serveUrl: string;
  builtAt: number;
}

const bundleCache = new Map<string, BundleCacheEntry>();

export async function bundleOnce(entryTsx: string): Promise<string> {
  const cached = bundleCache.get(entryTsx);
  if (cached) return cached.serveUrl;
  try {
    const serveUrl = await bundle({
      entryPoint: entryTsx,
      // Remotion's bundler handles webpack config internally; no overrides
      // needed for our stock templates.
    });
    bundleCache.set(entryTsx, { serveUrl, builtAt: Date.now() });
    logger.info('remotion.bundle', { entryTsx, serveUrl });
    return serveUrl;
  } catch (cause) {
    throw new ProviderError({
      provider: 'remotion',
      code: 'bundle_failed',
      message: `Remotion bundle failed for ${entryTsx}: ${(cause as Error).message}`,
      nextStep: 'Check the template sources for TSX / import errors.',
      cause,
    });
  }
}

export async function invalidateBundle(entryTsx?: string): Promise<void> {
  if (entryTsx === undefined) {
    bundleCache.clear();
    return;
  }
  bundleCache.delete(entryTsx);
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

export async function renderMedia(r: RenderRequest): Promise<{ durationSeconds: number }> {
  // Selecting the composition first gives us the concrete duration / fps /
  // dimensions computed for these specific inputProps (important for
  // FullExplainer whose durationInFrames is a function).
  let composition;
  try {
    composition = await selectComposition({
      serveUrl: r.serveUrl,
      id: r.compositionId,
      inputProps: r.inputProps as Record<string, unknown>,
    });
  } catch (cause) {
    throw new ProviderError({
      provider: 'remotion',
      code: 'composition_not_found',
      message: `No composition with id "${r.compositionId}" in the bundle.`,
      nextStep: 'Check Root.tsx — the id must match exactly.',
      cause,
    });
  }

  try {
    type RenderOpts = Parameters<typeof remotionRenderMedia>[0];
    const renderOptions: RenderOpts = {
      composition,
      serveUrl: r.serveUrl,
      codec: r.codec === 'h265' ? 'h265' : 'h264',
      outputLocation: r.outputPath,
      inputProps: r.inputProps as Record<string, unknown>,
      crf: r.crf,
      x264Preset: r.ffmpegPreset,
      audioCodec: r.audioCodec,
      // Remotion types the audio bitrate as a template literal like `192k`.
      // We keep it a plain string at our layer and cast at the boundary.
      audioBitrate: r.audioBitrate as Exclude<RenderOpts['audioBitrate'], undefined>,
      onProgress: ({ renderedFrames }) => {
        r.onProgress?.({
          renderedFrames,
          totalFrames: composition.durationInFrames,
        });
      },
      ...(r.jpegQuality !== undefined ? { jpegQuality: r.jpegQuality } : {}),
      ...(r.signal
        ? { cancelSignal: r.signal as unknown as NonNullable<RenderOpts['cancelSignal']> }
        : {}),
    };
    await remotionRenderMedia(renderOptions);
    return { durationSeconds: composition.durationInFrames / composition.fps };
  } catch (cause) {
    if (r.signal?.aborted) {
      throw new ProviderError({
        provider: 'remotion',
        code: 'aborted',
        message: 'Render was cancelled.',
      });
    }
    throw new ProviderError({
      provider: 'remotion',
      code: 'render_failed',
      message: `Remotion render failed: ${(cause as Error).message}`,
      cause,
    });
  }
}
