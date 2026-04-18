import * as keychain from '@main/platform/keychain.js';
import { readFileSync } from 'node:fs';
import { ProviderError } from '@shared/errors.js';
import { request } from './http.js';

// HeyGen v2 REST wrapper per plan.md §Technical Requirements (FR-033, FR-034).
// Audio is uploaded to the dedicated asset endpoint (raw binary, not
// multipart) and referenced by `audio_asset_id` on the generate call.

const BASE_URL = 'https://api.heygen.com';
const UPLOAD_URL = 'https://upload.heygen.com/v1/asset';

export type GenerationMode = 'standard' | 'avatar_iv';

export interface TestKeyResult {
  plan: string;
  mtdCredits: number | null;
}

export interface StockAvatar {
  avatarId: string;
  name: string;
  tier: 'photo' | 'instant';
}

export interface GenerateVideoArgs {
  avatarId: string;
  audioAssetId: string;
  mode: GenerationMode;
  dimensions?: { width: number; height: number };
}

export interface VideoStatusPending {
  status: 'pending' | 'processing';
}
export interface VideoStatusCompleted {
  status: 'completed';
  videoUrl: string;
}
export interface VideoStatusFailed {
  status: 'failed';
  error: string;
}
export type VideoStatus = VideoStatusPending | VideoStatusCompleted | VideoStatusFailed;

async function apiKey(): Promise<string> {
  const key = await keychain.get('Lumo/heygen');
  if (key === null) {
    throw new ProviderError({
      provider: 'heygen',
      code: 'no_credential',
      message: 'No HeyGen API key is configured.',
      nextStep: 'Open Settings → Providers and paste your HeyGen key, then click Test.',
    });
  }
  return key;
}

async function authedHeaders(): Promise<Record<string, string>> {
  return { 'X-Api-Key': await apiKey() };
}

export async function testKey(): Promise<TestKeyResult> {
  const { body } = await request<HeyGenQuotaResponse>({
    provider: 'heygen',
    method: 'GET',
    url: `${BASE_URL}/v2/user/remaining_quota`,
    headers: await authedHeaders(),
  });
  const data = body?.data ?? body;
  const remaining = typeof data?.remaining_quota === 'number' ? data.remaining_quota : null;
  const total = typeof data?.total_quota === 'number' ? data.total_quota : null;
  const plan = typeof data?.plan_name === 'string' ? data.plan_name : 'unknown';
  const mtdCredits =
    total !== null && remaining !== null ? Math.max(0, total - remaining) : remaining;
  return { plan, mtdCredits };
}

export async function uploadAudioAsset(path: string): Promise<{ assetId: string }> {
  const audio = readFileSync(path);
  const { body } = await request<HeyGenUploadResponse>({
    provider: 'heygen',
    method: 'POST',
    url: UPLOAD_URL,
    headers: { ...(await authedHeaders()), 'Content-Type': 'audio/mpeg' },
    body: audio,
    timeoutMs: 120_000,
  });
  const assetId = body?.data?.id ?? body?.id;
  if (typeof assetId !== 'string' || assetId.length === 0) {
    throw new ProviderError({
      provider: 'heygen',
      code: 'invalid_upload_response',
      message: 'HeyGen upload succeeded but did not return an asset id.',
      nextStep:
        'Retry the upload; contact HeyGen support if this persists with the request id in logs.',
    });
  }
  return { assetId };
}

export async function generateVideo(args: GenerateVideoArgs): Promise<{ videoJobId: string }> {
  const endpoint = args.mode === 'avatar_iv' ? '/v2/video/av4/generate' : '/v2/video/generate';
  const dimensions = args.dimensions ?? { width: 1920, height: 1080 };

  const payload =
    args.mode === 'avatar_iv'
      ? {
          image_key: args.avatarId,
          audio_asset_id: args.audioAssetId,
          dimension: dimensions,
        }
      : {
          video_inputs: [
            {
              character: { type: 'avatar', avatar_id: args.avatarId },
              voice: { type: 'audio', audio_asset_id: args.audioAssetId },
            },
          ],
          dimension: dimensions,
        };

  const { body } = await request<HeyGenGenerateResponse>({
    provider: 'heygen',
    method: 'POST',
    url: `${BASE_URL}${endpoint}`,
    headers: await authedHeaders(),
    body: payload,
    timeoutMs: 60_000,
  });
  const videoJobId = body?.data?.video_id ?? body?.video_id;
  if (typeof videoJobId !== 'string' || videoJobId.length === 0) {
    throw new ProviderError({
      provider: 'heygen',
      code: 'invalid_generate_response',
      message: 'HeyGen generate call succeeded but did not return a video id.',
    });
  }
  return { videoJobId };
}

export async function getVideoStatus(videoJobId: string): Promise<VideoStatus> {
  const url = new URL(`${BASE_URL}/v1/video_status.get`);
  url.searchParams.set('video_id', videoJobId);
  const { body } = await request<HeyGenStatusResponse>({
    provider: 'heygen',
    method: 'GET',
    url: url.toString(),
    headers: await authedHeaders(),
  });
  const data = body?.data ?? body;
  const statusRaw = (data?.status ?? '').toString().toLowerCase();
  if (statusRaw === 'completed' || statusRaw === 'succeeded') {
    const videoUrl = data?.video_url ?? null;
    if (typeof videoUrl !== 'string' || videoUrl.length === 0) {
      return {
        status: 'failed',
        error: 'HeyGen reported completion without a video URL.',
      };
    }
    return { status: 'completed', videoUrl };
  }
  if (statusRaw === 'failed' || statusRaw === 'error') {
    return {
      status: 'failed',
      error: (data?.error as string | undefined) ?? 'HeyGen reported a failed render.',
    };
  }
  if (statusRaw === 'pending' || statusRaw === 'processing' || statusRaw === 'queued') {
    return { status: statusRaw === 'queued' ? 'pending' : (statusRaw as 'pending' | 'processing') };
  }
  return { status: 'failed', error: `Unknown HeyGen status "${statusRaw}".` };
}

export async function cancelVideo(videoJobId: string): Promise<void> {
  await request({
    provider: 'heygen',
    method: 'POST',
    url: `${BASE_URL}/v1/video.delete`,
    headers: await authedHeaders(),
    body: { video_id: videoJobId },
    expect: 'empty',
    timeoutMs: 15_000,
  });
}

export async function downloadCompletedVideo(
  videoUrl: string,
  options?: { signal?: AbortSignal },
): Promise<ReadableStream<Uint8Array>> {
  const init: RequestInit = {};
  if (options?.signal) init.signal = options.signal;
  const response = await fetch(videoUrl, init);
  if (!response.ok || response.body === null) {
    throw new ProviderError({
      provider: 'heygen',
      code: 'download_failed',
      message: `Download of completed video failed: HTTP ${response.status} ${response.statusText}`,
      nextStep: 'Retry the operation; HeyGen CDN URLs have short TTLs.',
    });
  }
  return response.body;
}

export async function listStockAvatars(): Promise<StockAvatar[]> {
  const { body } = await request<HeyGenAvatarsResponse>({
    provider: 'heygen',
    method: 'GET',
    url: `${BASE_URL}/v2/avatars`,
    headers: await authedHeaders(),
  });
  const avatars = body?.data?.avatars ?? body?.avatars ?? [];
  return avatars.map((a) => ({
    avatarId: a.avatar_id,
    name: a.avatar_name ?? a.name ?? 'Unnamed avatar',
    tier: 'photo' as const,
  }));
}

// --- response shapes (provider-side, loosely typed) ---

interface HeyGenEnvelope<T> {
  data?: T;
}

interface HeyGenQuotaResponse extends HeyGenEnvelope<{
  plan_name?: string;
  remaining_quota?: number;
  total_quota?: number;
}> {
  plan_name?: string;
  remaining_quota?: number;
  total_quota?: number;
}

interface HeyGenUploadResponse extends HeyGenEnvelope<{ id?: string }> {
  id?: string;
}

interface HeyGenGenerateResponse extends HeyGenEnvelope<{ video_id?: string }> {
  video_id?: string;
}

interface HeyGenStatusResponse extends HeyGenEnvelope<{
  status?: string;
  video_url?: string | null;
  error?: string | null;
}> {
  status?: string;
  video_url?: string | null;
  error?: string | null;
}

interface HeyGenAvatarsResponse extends HeyGenEnvelope<{
  avatars?: Array<{ avatar_id: string; avatar_name?: string; name?: string }>;
}> {
  avatars?: Array<{ avatar_id: string; avatar_name?: string; name?: string }>;
}
