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

// HeyGen distinguishes pre-built avatars ("avatar") from user-trained
// photo avatars ("talking_photo") at the API layer — different list
// fields in /v2/avatars and different character-type strings on the
// generate payload. We carry that through so the right field goes onto
// the wire when the operator picks one.
export type HeyGenAvatarKind = 'avatar' | 'talking_photo';

export interface StockAvatar {
  avatarId: string;
  name: string;
  tier: 'photo' | 'instant';
  kind: HeyGenAvatarKind;
}

export interface GenerateVideoArgs {
  avatarId: string;
  audioAssetId: string;
  mode: GenerationMode;
  dimensions?: { width: number; height: number };
  /** Human-readable video title. HeyGen rejects the request if this is empty
   *  or contains disallowed characters; the provider wrapper sanitises to
   *  a safe subset before sending. */
  title?: string;
  /** How HeyGen classifies the avatar. Defaults to 'avatar' for backward
   *  compatibility with callers that haven't yet plumbed the kind through. */
  avatarKind?: HeyGenAvatarKind;
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
  // v3 unifies Avatar IV, Avatar V, talking-photos, and regular avatars
  // behind a single endpoint. HeyGen selects the right engine per
  // avatar_id internally, so `mode` and `avatarKind` collapse at the
  // wire layer — we keep them in the arg type for cost estimation and
  // future-proofing, but the payload is the same either way. Avatar V
  // avatars created on heygen.com simply come back under the right
  // engine when we submit their avatar_id here. v2 endpoints remain
  // supported through 2026-10-31; v3 is where all new features land.
  const title = sanitiseVideoTitle(args.title);
  const dimensions = args.dimensions ?? { width: 1920, height: 1080 };
  const aspect_ratio = dimensions.height > dimensions.width ? '9:16' : '16:9';
  const resolution =
    dimensions.height >= 2160 ? '4k' : dimensions.height >= 1080 ? '1080p' : '720p';

  const payload = {
    type: 'avatar' as const,
    avatar_id: args.avatarId,
    audio_asset_id: args.audioAssetId,
    title,
    resolution,
    aspect_ratio,
  };

  const { body } = await request<HeyGenGenerateResponse>({
    provider: 'heygen',
    method: 'POST',
    url: `${BASE_URL}/v3/videos`,
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
  // v3: GET /v3/videos/{id}. Response fields: data.id, data.status,
  // data.video_url (presigned), data.failure_code, data.failure_message.
  // The old v1 /video_status.get used `error` as the failure field;
  // fall back to that shape too so a v2 fleet in mid-migration still
  // surfaces useful messages.
  const { body } = await request<HeyGenStatusResponse>({
    provider: 'heygen',
    method: 'GET',
    url: `${BASE_URL}/v3/videos/${encodeURIComponent(videoJobId)}`,
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
    const failure =
      (data?.failure_message as string | undefined) ??
      (data?.error as string | undefined) ??
      'HeyGen reported a failed render.';
    return { status: 'failed', error: failure };
  }
  // Treat every documented non-terminal state as one of our two internal
  // pending buckets. HeyGen has expanded this list over time — observed
  // values include pending, processing, queued, waiting, in_queue, and
  // draft. Mapping all "not yet running" states to `pending` and all
  // "running" states to `processing` keeps pollUntilTerminal happy; we
  // only need to distinguish the two well enough for UI progress copy.
  if (
    statusRaw === 'processing' ||
    statusRaw === 'rendering' ||
    statusRaw === 'generating'
  ) {
    return { status: 'processing' };
  }
  if (
    statusRaw === 'pending' ||
    statusRaw === 'queued' ||
    statusRaw === 'waiting' ||
    statusRaw === 'in_queue' ||
    statusRaw === 'draft' ||
    statusRaw === 'submitted'
  ) {
    return { status: 'pending' };
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

// --- avatar training (Phase 5 US3) ---------------------------------------

export type AvatarReadyStatus = 'training' | 'ready' | 'failed';

/**
 * Photo Avatar training. HeyGen's v2 flow is: upload the portrait as an
 * asset (returning `image_key`), then POST /v2/photo_avatar/train with the
 * key and a name. Returns an avatar identifier that getAvatarStatus polls.
 *
 * NOTE: HeyGen iterates their avatar-training endpoints more than any other
 * part of their API; treat this as best-effort and verify response shapes
 * against live docs at integration time.
 */
export async function createPhotoAvatar(args: {
  imagePath: string;
  name: string;
}): Promise<{ avatarId: string }> {
  const image = readFileSync(args.imagePath);
  const mime = mimeTypeForImage(args.imagePath);
  const uploaded = await request<HeyGenUploadResponse>({
    provider: 'heygen',
    method: 'POST',
    url: UPLOAD_URL,
    headers: { ...(await authedHeaders()), 'Content-Type': mime },
    body: image,
    timeoutMs: 120_000,
  });
  const imageKey = uploaded.body?.data?.id ?? uploaded.body?.id;
  if (typeof imageKey !== 'string' || imageKey.length === 0) {
    throw new ProviderError({
      provider: 'heygen',
      code: 'invalid_upload_response',
      message: 'HeyGen image upload succeeded but did not return an asset id.',
    });
  }
  const { body } = await request<{ data?: { avatar_id?: string }; avatar_id?: string }>({
    provider: 'heygen',
    method: 'POST',
    url: `${BASE_URL}/v2/photo_avatar/train`,
    headers: await authedHeaders(),
    body: { image_key: imageKey, name: args.name },
    timeoutMs: 60_000,
  });
  const avatarId = body?.data?.avatar_id ?? body?.avatar_id;
  if (typeof avatarId !== 'string' || avatarId.length === 0) {
    throw new ProviderError({
      provider: 'heygen',
      code: 'invalid_photo_avatar_response',
      message: 'HeyGen Photo Avatar training did not return an avatar id.',
    });
  }
  return { avatarId };
}

/**
 * Instant Avatar ("Digital Twin") training. Multi-segment video upload +
 * a train call. Exact shape of the train endpoint varies; this implementation
 * follows the documented v2 path and will need live-docs verification on
 * first real run.
 */
export async function createInstantAvatar(args: {
  segmentPaths: readonly string[];
  name: string;
}): Promise<{ avatarId: string }> {
  const uploadedKeys: string[] = [];
  for (const segmentPath of args.segmentPaths) {
    const bytes = readFileSync(segmentPath);
    const { body } = await request<HeyGenUploadResponse>({
      provider: 'heygen',
      method: 'POST',
      url: UPLOAD_URL,
      headers: { ...(await authedHeaders()), 'Content-Type': 'video/mp4' },
      body: bytes,
      timeoutMs: 15 * 60_000,
    });
    const key = body?.data?.id ?? body?.id;
    if (typeof key !== 'string' || key.length === 0) {
      throw new ProviderError({
        provider: 'heygen',
        code: 'invalid_upload_response',
        message: `HeyGen segment upload did not return an asset id (${segmentPath}).`,
      });
    }
    uploadedKeys.push(key);
  }
  const { body } = await request<{ data?: { avatar_id?: string }; avatar_id?: string }>({
    provider: 'heygen',
    method: 'POST',
    url: `${BASE_URL}/v2/video_avatar/train`,
    headers: await authedHeaders(),
    body: { video_keys: uploadedKeys, name: args.name },
    timeoutMs: 60_000,
  });
  const avatarId = body?.data?.avatar_id ?? body?.avatar_id;
  if (typeof avatarId !== 'string' || avatarId.length === 0) {
    throw new ProviderError({
      provider: 'heygen',
      code: 'invalid_instant_avatar_response',
      message: 'HeyGen Instant Avatar training did not return an avatar id.',
    });
  }
  return { avatarId };
}

/** Poll an avatar's training status. */
export async function getAvatarStatus(avatarId: string): Promise<AvatarReadyStatus> {
  const { body } = await request<{
    data?: { status?: string };
    status?: string;
  }>({
    provider: 'heygen',
    method: 'GET',
    url: `${BASE_URL}/v2/avatar/${encodeURIComponent(avatarId)}`,
    headers: await authedHeaders(),
  });
  const state = (body?.data?.status ?? body?.status ?? '').toString().toLowerCase();
  if (state === 'ready' || state === 'completed' || state === 'succeeded') return 'ready';
  if (state === 'failed' || state === 'error') return 'failed';
  return 'training';
}

/** Best-effort cancel of an in-flight avatar training. */
export async function cancelAvatarTraining(avatarId: string): Promise<void> {
  await request({
    provider: 'heygen',
    method: 'DELETE',
    url: `${BASE_URL}/v2/avatar/${encodeURIComponent(avatarId)}`,
    headers: await authedHeaders(),
    expect: 'empty',
    timeoutMs: 30_000,
  });
}

function mimeTypeForImage(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

// HeyGen rejects titles that are empty, null, or contain characters their
// moderation layer dislikes (observed: control chars, newlines, some
// unicode ranges, very long strings). Collapse whitespace, strip
// non-printable, clamp to 100 chars, fall back to a safe default.
function sanitiseVideoTitle(input: string | undefined): string {
  const fallback = 'Lumo render';
  if (typeof input !== 'string') return fallback;
  const collapsed = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (collapsed.length === 0) return fallback;
  // HeyGen's title field is documented as up to 100 chars; clamp well
  // under to stay safe across undocumented byte-length limits.
  return collapsed.slice(0, 80);
}

export async function listStockAvatars(): Promise<StockAvatar[]> {
  const { body } = await request<HeyGenAvatarsResponse>({
    provider: 'heygen',
    method: 'GET',
    url: `${BASE_URL}/v2/avatars`,
    headers: await authedHeaders(),
  });
  const avatars = body?.data?.avatars ?? body?.avatars ?? [];
  const talkingPhotos = body?.data?.talking_photos ?? body?.talking_photos ?? [];
  const avatarOptions: StockAvatar[] = avatars.map((a) => ({
    avatarId: a.avatar_id,
    name: a.avatar_name ?? a.name ?? 'Unnamed avatar',
    tier: 'photo' as const,
    kind: 'avatar' as const,
  }));
  // User-trained Photo Avatars come back under `talking_photos`. Prefix
  // the name so the operator can pick their own trained avatar out of a
  // list that may run to hundreds of stock entries.
  const talkingPhotoOptions: StockAvatar[] = talkingPhotos.map((t) => ({
    avatarId: t.talking_photo_id,
    name: `${t.talking_photo_name ?? 'Talking photo'} (trained)`,
    tier: 'photo' as const,
    kind: 'talking_photo' as const,
  }));
  // Trained entries first so the operator always sees their own work at
  // the top of the dropdown.
  return [...talkingPhotoOptions, ...avatarOptions];
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
  id?: string;
  status?: string;
  video_url?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
  /** Legacy v1/v2 field kept for transitional compatibility. */
  error?: string | null;
}> {
  id?: string;
  status?: string;
  video_url?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
  error?: string | null;
}

interface HeyGenAvatarsResponse extends HeyGenEnvelope<{
  avatars?: Array<{ avatar_id: string; avatar_name?: string; name?: string }>;
  talking_photos?: Array<{ talking_photo_id: string; talking_photo_name?: string }>;
}> {
  avatars?: Array<{ avatar_id: string; avatar_name?: string; name?: string }>;
  talking_photos?: Array<{ talking_photo_id: string; talking_photo_name?: string }>;
}
