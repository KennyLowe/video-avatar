import { describe, expect, it } from 'vitest';
import {
  estimateHeyGenCost,
  estimatePipelineCost,
  estimateTtsCost,
} from '@main/services/costEstimator.js';

describe('costEstimator', () => {
  it('estimates TTS cost as one credit per character', () => {
    const res = estimateTtsCost(500);
    expect(res.characters).toBe(500);
    expect(res.credits).toBe(500);
    expect(res.usd).toBeGreaterThan(0);
  });

  it('ceilings HeyGen credits on the 15-second boundary for Standard mode', () => {
    expect(estimateHeyGenCost(30, 'standard').credits).toBe(2);
    expect(estimateHeyGenCost(31, 'standard').credits).toBe(3);
  });

  it('applies a 5× multiplier to Avatar IV credits', () => {
    const standard = estimateHeyGenCost(60, 'standard');
    const iv = estimateHeyGenCost(60, 'avatar_iv');
    expect(iv.credits).toBe(standard.credits * 5);
    expect(iv.usd).toBeCloseTo(standard.usd * 5);
  });

  it('sums the two lines into totalUsd', () => {
    const all = estimatePipelineCost({
      characterCount: 1_000,
      estimatedDurationSeconds: 30,
      mode: 'standard',
    });
    expect(all.totalUsd).toBeCloseTo(all.elevenlabs.usd + all.heygen.usd);
  });
});
