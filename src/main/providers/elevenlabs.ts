import { ProviderError } from '@shared/errors.js';

// Skeleton. Real implementation lands in Phase 3 T044 (testKey, tts, stock
// voices, minimums) and Phase 4 T074 (PVC/IVC submission + status).
// All functions throw a typed ProviderError with code 'not_implemented' until
// the owning phase lands.

function notImplemented(fn: string): never {
  throw new ProviderError({
    provider: 'elevenlabs',
    code: 'not_implemented',
    message: `elevenlabs.${fn} is not wired up in Phase 2.`,
  });
}

export async function testKey(): Promise<{ plan: string; mtdCredits: number | null }> {
  return notImplemented('testKey');
}

export async function tts(_args: {
  voiceId: string;
  text: string;
  signal?: AbortSignal;
}): Promise<{ mp3: Buffer; characters: number }> {
  return notImplemented('tts');
}

export async function listStockVoices(): Promise<
  Array<{ voiceId: string; name: string; preview: string | null }>
> {
  return notImplemented('listStockVoices');
}

export async function getPvcMinimumSeconds(): Promise<number> {
  return notImplemented('getPvcMinimumSeconds');
}

export async function getIvcMinimumSeconds(): Promise<number> {
  return notImplemented('getIvcMinimumSeconds');
}
