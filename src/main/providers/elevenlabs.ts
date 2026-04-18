import * as keychain from '@main/platform/keychain.js';
import { ProviderError } from '@shared/errors.js';
import { request } from './http.js';

// ElevenLabs REST wrapper per plan.md §Technical Requirements.
// Credentials: fetched from keychain at call time (never cached at module
// scope, per contracts/provider-wrappers.md).

const BASE_URL = 'https://api.elevenlabs.io';

export interface TestKeyResult {
  plan: string;
  mtdCredits: number | null;
}

export interface StockVoice {
  voiceId: string;
  name: string;
  preview: string | null;
}

export interface TtsOptions {
  voiceId: string;
  text: string;
  modelId?: string;
  voiceSettings?: { stability: number; similarityBoost: number; style?: number };
  signal?: AbortSignal;
}

export interface TtsResult {
  mp3: Buffer;
  characters: number;
}

// Cache for session-only threshold queries.
let cachedPvcSeconds: number | null = null;
let cachedIvcSeconds: number | null = null;
const DEFAULT_PVC_SECONDS = 1800;
const DEFAULT_IVC_SECONDS = 60;

async function apiKey(): Promise<string> {
  const key = await keychain.get('Lumo/elevenlabs');
  if (key === null) {
    throw new ProviderError({
      provider: 'elevenlabs',
      code: 'no_credential',
      message: 'No ElevenLabs API key is configured.',
      nextStep: 'Open Settings → Providers and paste your ElevenLabs key, then click Test.',
    });
  }
  return key;
}

async function authedHeaders(): Promise<Record<string, string>> {
  return { 'xi-api-key': await apiKey() };
}

export async function testKey(): Promise<TestKeyResult> {
  const { body } = await request<ElevenUser>({
    provider: 'elevenlabs',
    method: 'GET',
    url: `${BASE_URL}/v1/user`,
    headers: await authedHeaders(),
  });
  const plan = body?.subscription?.tier ?? body?.subscription?.status ?? 'unknown';
  const limit = body?.subscription?.character_limit ?? null;
  const used = body?.subscription?.character_count ?? null;
  const mtdCredits = limit !== null && used !== null ? Math.max(0, limit - used) : null;
  return { plan, mtdCredits };
}

export async function tts(opts: TtsOptions): Promise<TtsResult> {
  const body = {
    text: opts.text,
    model_id: opts.modelId ?? 'eleven_multilingual_v2',
    voice_settings: opts.voiceSettings ?? { stability: 0.4, similarityBoost: 0.75 },
  };
  const result = await request<Buffer>({
    provider: 'elevenlabs',
    method: 'POST',
    url: `${BASE_URL}/v1/text-to-speech/${encodeURIComponent(opts.voiceId)}`,
    headers: { ...(await authedHeaders()), Accept: 'audio/mpeg' },
    body,
    expect: 'binary',
    timeoutMs: 120_000,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  return { mp3: result.body, characters: opts.text.length };
}

export async function listStockVoices(): Promise<StockVoice[]> {
  const { body } = await request<ElevenVoicesResponse>({
    provider: 'elevenlabs',
    method: 'GET',
    url: `${BASE_URL}/v1/voices`,
    headers: await authedHeaders(),
  });
  const voices = body?.voices ?? [];
  return voices.map((v) => ({
    voiceId: v.voice_id,
    name: v.name ?? 'Unnamed voice',
    preview: typeof v.preview_url === 'string' ? v.preview_url : null,
  }));
}

export async function getPvcMinimumSeconds(): Promise<number> {
  if (cachedPvcSeconds !== null) return cachedPvcSeconds;
  // ElevenLabs does not currently expose a dedicated "minimum PVC duration"
  // endpoint. Per research.md §2, default to 30 minutes as the recommended
  // floor; the authoritative check is the service's rejection at submit time.
  cachedPvcSeconds = DEFAULT_PVC_SECONDS;
  return cachedPvcSeconds;
}

export async function getIvcMinimumSeconds(): Promise<number> {
  if (cachedIvcSeconds !== null) return cachedIvcSeconds;
  cachedIvcSeconds = DEFAULT_IVC_SECONDS;
  return cachedIvcSeconds;
}

export function __resetForTests(): void {
  cachedPvcSeconds = null;
  cachedIvcSeconds = null;
}

// --- response shapes (provider-side, loosely typed for robustness) ---

interface ElevenUser {
  subscription?: {
    tier?: string;
    status?: string;
    character_limit?: number;
    character_count?: number;
  };
}

interface ElevenVoicesResponse {
  voices?: Array<{ voice_id: string; name?: string; preview_url?: string | null }>;
}
