// Pre-upload quality-heuristics evaluator per FR-027. Pure function. No
// DOM / canvas imports — runs under vitest node env. The renderer's
// FaceDetectPanel wraps it with live-inspector affordances.
//
// Design: the evaluator receives already-computed numeric readings
// (resolution, face counts, sharpness, motion) and produces a list of
// warnings / rejections with stable rule ids so the UI can format them.

export type HeuristicSeverity = 'warn' | 'reject';

export interface HeuristicFinding {
  readonly ruleId: 'resolution' | 'face-coverage' | 'multi-face' | 'motion' | 'sharpness';
  readonly severity: HeuristicSeverity;
  readonly message: string;
}

export interface VideoFrameSample {
  /** Number of faces detected in the frame. */
  readonly faceCount: number;
  /** Laplacian variance, used as a sharpness proxy. */
  readonly laplacianVariance: number;
}

export interface VideoHeuristicInput {
  readonly shortEdgePx: number;
  readonly frameSamples: readonly VideoFrameSample[];
  /** Mean inter-frame pixel delta across sampled frames, in 0..1. */
  readonly meanInterFrameDelta: number;
}

export interface ImageHeuristicInput {
  readonly shortEdgePx: number;
  readonly faceCount: number;
  readonly laplacianVariance: number;
}

// Thresholds pinned in FR-027.
export const VIDEO_SHORT_EDGE_MIN_PX = 1080;
export const IMAGE_SHORT_EDGE_MIN_PX = 1024;
export const VIDEO_FACE_COVERAGE_MIN = 0.9;
export const VIDEO_MOTION_DELTA_MAX = 0.15;
export const SHARPNESS_LAPLACIAN_MIN = 120;

export function evaluateVideo(input: VideoHeuristicInput): HeuristicFinding[] {
  const findings: HeuristicFinding[] = [];

  if (input.shortEdgePx > 0 && input.shortEdgePx < VIDEO_SHORT_EDGE_MIN_PX) {
    findings.push({
      ruleId: 'resolution',
      severity: 'warn',
      message: `Short edge ${input.shortEdgePx}px is below ${VIDEO_SHORT_EDGE_MIN_PX}px — avatar quality may suffer.`,
    });
  }

  const samples = input.frameSamples;
  if (samples.length > 0) {
    const oneFace = samples.filter((s) => s.faceCount === 1).length;
    const multiFace = samples.filter((s) => s.faceCount > 1).length;
    const coverage = oneFace / samples.length;

    if (coverage < VIDEO_FACE_COVERAGE_MIN) {
      findings.push({
        ruleId: 'face-coverage',
        severity: 'warn',
        message: `Only ${Math.round(coverage * 100)}% of sampled frames showed exactly one face (need ≥ ${Math.round(VIDEO_FACE_COVERAGE_MIN * 100)}%).`,
      });
    }
    if (multiFace > 0) {
      findings.push({
        ruleId: 'multi-face',
        severity: 'warn',
        message: `${multiFace} of ${samples.length} sampled frames contain more than one face — background people will confuse training.`,
      });
    }

    // Apply sharpness to the middle frame's Laplacian variance.
    const middle = samples[Math.floor(samples.length / 2)];
    if (middle !== undefined && middle.laplacianVariance < SHARPNESS_LAPLACIAN_MIN) {
      findings.push({
        ruleId: 'sharpness',
        severity: 'warn',
        message: `Middle-frame sharpness (${middle.laplacianVariance.toFixed(0)}) is below the ${SHARPNESS_LAPLACIAN_MIN} threshold — the clip may be soft or motion-blurred.`,
      });
    }
  }

  if (input.meanInterFrameDelta > VIDEO_MOTION_DELTA_MAX) {
    findings.push({
      ruleId: 'motion',
      severity: 'warn',
      message: `Mean inter-frame motion ${Math.round(input.meanInterFrameDelta * 100)}% of frame area exceeds ${Math.round(VIDEO_MOTION_DELTA_MAX * 100)}% — camera shake or background movement.`,
    });
  }

  return findings;
}

export function evaluateImage(input: ImageHeuristicInput): HeuristicFinding[] {
  const findings: HeuristicFinding[] = [];

  if (input.shortEdgePx > 0 && input.shortEdgePx < IMAGE_SHORT_EDGE_MIN_PX) {
    findings.push({
      ruleId: 'resolution',
      severity: 'warn',
      message: `Short edge ${input.shortEdgePx}px is below ${IMAGE_SHORT_EDGE_MIN_PX}px — avatar quality may suffer.`,
    });
  }

  if (input.faceCount === 0) {
    findings.push({
      ruleId: 'face-coverage',
      severity: 'reject',
      message: 'No face detected — Photo Avatar requires exactly one face in the frame.',
    });
  } else if (input.faceCount > 1) {
    findings.push({
      ruleId: 'multi-face',
      severity: 'reject',
      message: `${input.faceCount} faces detected — Photo Avatar requires exactly one face.`,
    });
  }

  if (input.laplacianVariance < SHARPNESS_LAPLACIAN_MIN) {
    findings.push({
      ruleId: 'sharpness',
      severity: 'warn',
      message: `Sharpness (${input.laplacianVariance.toFixed(0)}) is below the ${SHARPNESS_LAPLACIAN_MIN} threshold — the image may be soft or out of focus.`,
    });
  }

  return findings;
}

/** Returns true if any finding is severity='reject' — blocks upload. */
export function hasRejection(findings: readonly HeuristicFinding[]): boolean {
  return findings.some((f) => f.severity === 'reject');
}
