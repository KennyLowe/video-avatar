import { describe, expect, it } from 'vitest';
import {
  evaluateImage,
  evaluateVideo,
  hasRejection,
  IMAGE_SHORT_EDGE_MIN_PX,
  SHARPNESS_LAPLACIAN_MIN,
  VIDEO_FACE_COVERAGE_MIN,
  VIDEO_MOTION_DELTA_MAX,
  VIDEO_SHORT_EDGE_MIN_PX,
} from '@renderer/services/qualityHeuristics.js';

// Boundary tests pinning every FR-027 threshold so the next iteration
// doesn't silently drift the quality gate.

describe('qualityHeuristics.evaluateVideo', () => {
  const passingSample = { faceCount: 1, laplacianVariance: SHARPNESS_LAPLACIAN_MIN + 50 };

  it('returns no findings for a high-quality clip', () => {
    expect(
      evaluateVideo({
        shortEdgePx: VIDEO_SHORT_EDGE_MIN_PX + 100,
        frameSamples: Array(10).fill(passingSample),
        meanInterFrameDelta: 0.02,
      }),
    ).toEqual([]);
  });

  it('warns when short edge is below 1080 px', () => {
    const out = evaluateVideo({
      shortEdgePx: 720,
      frameSamples: Array(10).fill(passingSample),
      meanInterFrameDelta: 0.01,
    });
    expect(out.some((f) => f.ruleId === 'resolution' && f.severity === 'warn')).toBe(true);
  });

  it('warns when face coverage drops below 90%', () => {
    const samples = Array(10)
      .fill(0)
      .map((_, i) => (i < 8 ? passingSample : { faceCount: 0, laplacianVariance: 200 }));
    const out = evaluateVideo({
      shortEdgePx: 1080,
      frameSamples: samples,
      meanInterFrameDelta: 0.02,
    });
    expect(out.some((f) => f.ruleId === 'face-coverage')).toBe(true);
  });

  it('warns on any multi-face frame in video samples (non-blocking)', () => {
    const samples = [
      { faceCount: 1, laplacianVariance: 200 },
      { faceCount: 2, laplacianVariance: 200 },
      ...Array(8).fill(passingSample),
    ];
    const out = evaluateVideo({
      shortEdgePx: 1080,
      frameSamples: samples,
      meanInterFrameDelta: 0.02,
    });
    const finding = out.find((f) => f.ruleId === 'multi-face');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('warn');
  });

  it(`warns when motion exceeds ${VIDEO_MOTION_DELTA_MAX * 100}% of frame area`, () => {
    const out = evaluateVideo({
      shortEdgePx: 1080,
      frameSamples: Array(5).fill(passingSample),
      meanInterFrameDelta: VIDEO_MOTION_DELTA_MAX + 0.01,
    });
    expect(out.some((f) => f.ruleId === 'motion')).toBe(true);
  });

  it('warns on low sharpness on the middle frame', () => {
    const samples = Array(5).fill({
      faceCount: 1,
      laplacianVariance: SHARPNESS_LAPLACIAN_MIN - 10,
    });
    const out = evaluateVideo({
      shortEdgePx: 1080,
      frameSamples: samples,
      meanInterFrameDelta: 0.01,
    });
    expect(out.some((f) => f.ruleId === 'sharpness')).toBe(true);
  });
});

describe('qualityHeuristics.evaluateImage', () => {
  const passing = {
    shortEdgePx: IMAGE_SHORT_EDGE_MIN_PX + 100,
    faceCount: 1,
    laplacianVariance: SHARPNESS_LAPLACIAN_MIN + 50,
  };

  it('returns no findings for a passing image', () => {
    expect(evaluateImage(passing)).toEqual([]);
  });

  it('warns when short edge is below 1024 px', () => {
    expect(
      evaluateImage({ ...passing, shortEdgePx: 800 }).some((f) => f.ruleId === 'resolution'),
    ).toBe(true);
  });

  it('REJECTS a Photo Avatar candidate with zero faces', () => {
    const findings = evaluateImage({ ...passing, faceCount: 0 });
    expect(findings.some((f) => f.ruleId === 'face-coverage' && f.severity === 'reject')).toBe(
      true,
    );
    expect(hasRejection(findings)).toBe(true);
  });

  it('REJECTS a Photo Avatar candidate with multiple faces', () => {
    const findings = evaluateImage({ ...passing, faceCount: 3 });
    expect(findings.some((f) => f.ruleId === 'multi-face' && f.severity === 'reject')).toBe(true);
    expect(hasRejection(findings)).toBe(true);
  });

  it('warns (not rejects) on low image sharpness', () => {
    const findings = evaluateImage({ ...passing, laplacianVariance: SHARPNESS_LAPLACIAN_MIN - 20 });
    const finding = findings.find((f) => f.ruleId === 'sharpness');
    expect(finding?.severity).toBe('warn');
    expect(hasRejection(findings)).toBe(false);
  });
});

describe('qualityHeuristics.VIDEO_FACE_COVERAGE_MIN', () => {
  it('is 0.9 per FR-027', () => {
    expect(VIDEO_FACE_COVERAGE_MIN).toBe(0.9);
  });
});
