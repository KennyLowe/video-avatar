import { ProviderError } from '@shared/errors.js';

// Skeleton. Real implementation lands in Phase 3 T045 (testKey,
// uploadAudioAsset, generateVideo, getVideoStatus, cancelVideo, stock
// avatars) and Phase 5 T089 (createPhotoAvatar, createInstantAvatar,
// getAvatarStatus).

function notImplemented(fn: string): never {
  throw new ProviderError({
    provider: 'heygen',
    code: 'not_implemented',
    message: `heygen.${fn} is not wired up in Phase 2.`,
  });
}

export async function testKey(): Promise<{ plan: string; mtdCredits: number | null }> {
  return notImplemented('testKey');
}

export async function uploadAudioAsset(_path: string): Promise<{ assetId: string }> {
  return notImplemented('uploadAudioAsset');
}

export async function generateVideo(_args: {
  avatarId: string;
  audioAssetId: string;
  mode: 'standard' | 'avatar_iv';
}): Promise<{ videoJobId: string }> {
  return notImplemented('generateVideo');
}

export async function getVideoStatus(
  _videoJobId: string,
): Promise<
  | { status: 'pending' | 'processing' }
  | { status: 'completed'; videoUrl: string }
  | { status: 'failed'; error: string }
> {
  return notImplemented('getVideoStatus');
}

export async function cancelVideo(_videoJobId: string): Promise<void> {
  return notImplemented('cancelVideo');
}

export async function listStockAvatars(): Promise<
  Array<{ avatarId: string; name: string; tier: 'photo' | 'instant' }>
> {
  return notImplemented('listStockAvatars');
}
