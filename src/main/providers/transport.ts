import { ProviderError } from '@shared/errors.js';
import type { TransportKind } from '@shared/schemas/project.js';
import * as heygen from './heygen.js';

// Audio-transfer resolver per FR-034 / research.md §4.
// Default: 'heygen' — uploads to upload.heygen.com/v1/asset, refs via
// audio_asset_id on the generate call. Fallbacks (S3/R2/cloudflared) arrive
// in Phase 8 T133 / T134.

export interface TransportPutResult {
  kind: 'url' | 'asset';
  url?: string;
  assetId?: string;
  cleanup?: () => Promise<void>;
}

export interface Transport {
  readonly kind: TransportKind;
  isAvailable(): Promise<boolean>;
  put(localPath: string, hint?: { suggestedName?: string }): Promise<TransportPutResult>;
}

const heygenTransport: Transport = {
  kind: 'heygen',
  isAvailable: async () => true,
  put: async (localPath) => {
    const { assetId } = await heygen.uploadAudioAsset(localPath);
    return { kind: 'asset', assetId };
  },
};

const notImplementedKinds: readonly TransportKind[] = ['s3', 'r2', 'cloudflared'];

export function resolve(project?: { uploadTransport?: TransportKind }): Transport {
  const preferred = project?.uploadTransport ?? 'heygen';
  if (preferred === 'heygen') return heygenTransport;
  if (notImplementedKinds.includes(preferred)) {
    return {
      kind: preferred,
      isAvailable: async () => false,
      put: async () => {
        throw new ProviderError({
          provider: 'transport',
          code: 'not_implemented',
          message: `transport.${preferred} is not wired up yet (lands in Phase 8).`,
          nextStep:
            'Set Settings → Upload transport to "heygen" for now; S3/R2/cloudflared arrive with the polish pass.',
        });
      },
    };
  }
  return heygenTransport;
}
