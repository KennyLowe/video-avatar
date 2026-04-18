import { readFileSync } from 'node:fs';
import * as path from 'node:path';
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

// --- voice cloning --------------------------------------------------------

export interface VoiceCloneSubmission {
  name: string;
  description?: string;
  files: readonly string[];
}

/** Instant Voice Cloning. `/v1/voices/add` — multipart; returns ready voice. */
export async function createIVC(sub: VoiceCloneSubmission): Promise<{ voiceId: string }> {
  const form = buildVoiceForm(sub);
  const { body } = await request<{ voice_id?: string }>({
    provider: 'elevenlabs',
    method: 'POST',
    url: `${BASE_URL}/v1/voices/add`,
    headers: await authedHeaders(),
    body: form,
    timeoutMs: 300_000,
  });
  if (typeof body?.voice_id !== 'string' || body.voice_id.length === 0) {
    throw new ProviderError({
      provider: 'elevenlabs',
      code: 'invalid_ivc_response',
      message: 'ElevenLabs IVC succeeded but did not return a voice_id.',
    });
  }
  return { voiceId: body.voice_id };
}

/**
 * Professional Voice Cloning. Submission returns a voice_id immediately;
 * training runs server-side for 1–4 hours. Poll `getVoiceStatus(voiceId)`
 * until `'ready'` or `'failed'`. PVC endpoints change more often than IVC;
 * verify against current docs at implementation time.
 */
export async function createPVC(sub: VoiceCloneSubmission): Promise<{ voiceId: string }> {
  const form = buildVoiceForm(sub);
  const { body } = await request<{ voice_id?: string }>({
    provider: 'elevenlabs',
    method: 'POST',
    url: `${BASE_URL}/v1/voices/pvc/create`,
    headers: await authedHeaders(),
    body: form,
    timeoutMs: 300_000,
  });
  if (typeof body?.voice_id !== 'string' || body.voice_id.length === 0) {
    throw new ProviderError({
      provider: 'elevenlabs',
      code: 'invalid_pvc_response',
      message: 'ElevenLabs PVC submission succeeded but did not return a voice_id.',
    });
  }
  return { voiceId: body.voice_id };
}

export type VoiceReadyStatus = 'training' | 'ready' | 'failed';

export async function getVoiceStatus(voiceId: string): Promise<VoiceReadyStatus> {
  const { body } = await request<{ status?: string; fine_tuning?: { state?: string } }>({
    provider: 'elevenlabs',
    method: 'GET',
    url: `${BASE_URL}/v1/voices/${encodeURIComponent(voiceId)}`,
    headers: await authedHeaders(),
  });
  const state = (body?.fine_tuning?.state ?? body?.status ?? '').toString().toLowerCase();
  if (state === 'ready' || state === 'fine_tuned' || state === 'finished') return 'ready';
  if (state === 'failed' || state === 'error') return 'failed';
  return 'training';
}

export async function cancelVoiceTraining(voiceId: string): Promise<void> {
  await request({
    provider: 'elevenlabs',
    method: 'DELETE',
    url: `${BASE_URL}/v1/voices/${encodeURIComponent(voiceId)}`,
    headers: await authedHeaders(),
    expect: 'empty',
    timeoutMs: 30_000,
  });
}

function buildVoiceForm(sub: VoiceCloneSubmission): FormData {
  const form = new FormData();
  form.append('name', sub.name);
  if (sub.description) form.append('description', sub.description);
  for (const filePath of sub.files) {
    const bytes = readFileSync(filePath);
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    const filename = path.basename(filePath);
    form.append('files', new Blob([ab], { type: 'audio/wav' }), filename);
  }
  return form;
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
