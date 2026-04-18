// Face-detection adapter wrapping @vladmandic/face-api. Runs in the renderer
// via the TF.js WebGL backend; models are lazy-loaded from resources/face-api
// on first call. If models aren't present (bundled installers ship them;
// dev may not), the adapter returns a "not-ready" signal and the quality
// heuristics skip face-coverage / multi-face findings — warn-only feature,
// so an empty result is preferable to a hard error.
//
// Kept deliberately narrow: one function per public need. Heavier
// multi-face / landmark logic arrives if we ever need liveness or emotion.

import type { ImageHeuristicInput, VideoFrameSample } from './qualityHeuristics.js';

let loaded = false;
let available = false;

async function ensureLoaded(): Promise<boolean> {
  if (loaded) return available;
  loaded = true;
  try {
    const faceapi = await import('@vladmandic/face-api');
    const modelsPath = new URL('../../../resources/face-api', import.meta.url).toString();
    // Ignore unresolved ESM-in-renderer woes: we're only calling this inside
    // the renderer process where import.meta.url resolves.
    await faceapi.nets.tinyFaceDetector.loadFromUri(modelsPath);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export interface FaceDetectResult {
  faceCount: number;
  laplacianVariance: number;
}

/** Count faces in a single image (used for Photo Avatar uploads). */
export async function detectImage(imgEl: HTMLImageElement): Promise<FaceDetectResult> {
  const ok = await ensureLoaded();
  if (!ok) return { faceCount: 1, laplacianVariance: 500 }; // conservative no-op
  const faceapi = await import('@vladmandic/face-api');
  const detections = await faceapi.detectAllFaces(
    imgEl,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416 }),
  );
  return {
    faceCount: detections.length,
    laplacianVariance: laplacianVarianceOfImage(imgEl),
  };
}

/** Count faces in each sampled frame (used for video Instant Avatar uploads). */
export async function detectVideoFrames(
  imgEls: readonly HTMLImageElement[],
): Promise<VideoFrameSample[]> {
  const ok = await ensureLoaded();
  if (!ok) {
    return imgEls.map(() => ({ faceCount: 1, laplacianVariance: 500 }));
  }
  const faceapi = await import('@vladmandic/face-api');
  const out: VideoFrameSample[] = [];
  for (const img of imgEls) {
    const detections = await faceapi.detectAllFaces(
      img,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 416 }),
    );
    out.push({
      faceCount: detections.length,
      laplacianVariance: laplacianVarianceOfImage(img),
    });
  }
  return out;
}

/**
 * Approximate Laplacian variance via a 3×3 kernel on a downscaled greyscale
 * copy of the image. Used as a sharpness proxy per FR-027. Cheap enough to
 * run synchronously on every sampled frame.
 */
function laplacianVarianceOfImage(img: HTMLImageElement): number {
  const downscale = 256;
  const canvas = document.createElement('canvas');
  const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
  canvas.width = aspect >= 1 ? downscale : Math.round(downscale * aspect);
  canvas.height = aspect >= 1 ? Math.round(downscale / aspect) : downscale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const grey = new Float32Array(canvas.width * canvas.height);
  const { data } = image;
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    grey[p] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  // 3×3 Laplacian kernel: 0 -1 0 / -1 4 -1 / 0 -1 0.
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  const w = canvas.width;
  const h = canvas.height;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const p = grey[y * w + x] ?? 0;
      const up = grey[(y - 1) * w + x] ?? 0;
      const down = grey[(y + 1) * w + x] ?? 0;
      const left = grey[y * w + (x - 1)] ?? 0;
      const right = grey[y * w + (x + 1)] ?? 0;
      const l = 4 * p - up - down - left - right;
      sum += l;
      sumSq += l * l;
      n += 1;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Inter-frame pixel delta across a sequence of frames in 0..1 — used for
 *  the motion heuristic. Computes mean absolute difference on greyscale. */
export function meanInterFrameDelta(imgEls: readonly HTMLImageElement[]): number {
  if (imgEls.length < 2) return 0;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  let previous: Float32Array | null = null;
  let deltaSum = 0;
  let count = 0;
  for (const img of imgEls) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const grey = new Float32Array(canvas.width * canvas.height);
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      grey[p] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    if (previous !== null) {
      let frameDelta = 0;
      for (let i = 0; i < grey.length; i += 1) {
        frameDelta += Math.abs((grey[i] ?? 0) - (previous[i] ?? 0));
      }
      deltaSum += frameDelta / grey.length;
      count += 1;
    }
    previous = grey;
  }
  return count === 0 ? 0 : deltaSum / count;
}

// Re-export the heuristic input types so the Avatar screen can wire through.
export type { ImageHeuristicInput };
