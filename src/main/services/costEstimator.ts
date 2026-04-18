// Cost estimator per FR-048 / FR-049. Static rate tables committed with a
// `sources.md` note — providers change pricing occasionally; when they do,
// bump the constants and add a line to sources.md.
//
// Principle: "estimated" means estimated. The ledger records actual units
// from provider responses where exposed (e.g. ElevenLabs TTS returns
// character count). The preview is derived from the inputs the operator can
// see before they click Run.

import type { GenerationMode } from '@shared/schemas/render.js';

// ElevenLabs TTS (Creator plan rate used as the baseline; Pro is cheaper per
// credit but the ratio is preserved). 1 credit ≈ 1 character on Standard
// voices in v2; Turbo/v3 models differ. We document the assumption here
// rather than infer it at runtime.
const ELEVENLABS_USD_PER_CHARACTER = 0.00003; // Creator plan, v2 model.

// HeyGen credits: Standard video = 1 credit per ~15 seconds (fluctuates).
// Avatar IV = 5× Standard (research.md notes the premium multiplier).
const HEYGEN_SECONDS_PER_CREDIT_STANDARD = 15;
const HEYGEN_USD_PER_CREDIT = 0.1; // Pro plan effective rate.
const AVATAR_IV_MULTIPLIER = 5;

export interface CostEstimate {
  readonly elevenlabs: { characters: number; credits: number; usd: number };
  readonly heygen: { seconds: number; credits: number; usd: number };
  readonly totalUsd: number;
}

export function estimateTtsCost(characterCount: number): CostEstimate['elevenlabs'] {
  const credits = characterCount;
  const usd = characterCount * ELEVENLABS_USD_PER_CHARACTER;
  return { characters: characterCount, credits, usd };
}

export function estimateHeyGenCost(
  estimatedDurationSeconds: number,
  mode: GenerationMode,
): CostEstimate['heygen'] {
  const baseCredits = Math.ceil(estimatedDurationSeconds / HEYGEN_SECONDS_PER_CREDIT_STANDARD);
  const credits = mode === 'avatar_iv' ? baseCredits * AVATAR_IV_MULTIPLIER : baseCredits;
  const usd = credits * HEYGEN_USD_PER_CREDIT;
  return { seconds: estimatedDurationSeconds, credits, usd };
}

export function estimatePipelineCost(input: {
  characterCount: number;
  estimatedDurationSeconds: number;
  mode: GenerationMode;
}): CostEstimate {
  const elevenlabs = estimateTtsCost(input.characterCount);
  const heygen = estimateHeyGenCost(input.estimatedDurationSeconds, input.mode);
  return {
    elevenlabs,
    heygen,
    totalUsd: elevenlabs.usd + heygen.usd,
  };
}
