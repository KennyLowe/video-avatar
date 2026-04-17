import { ProviderError } from '@shared/errors.js';
import type { TransportKind } from '@shared/schemas/project.js';

// Skeleton. Real implementation arrives in Phase 3 T046 ('heygen' default)
// and Phase 8 T133 / T134 (S3/R2 + cloudflared).

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

function notImplemented(kind: TransportKind): Transport {
  return {
    kind,
    isAvailable: async () => false,
    put: async () => {
      throw new ProviderError({
        provider: 'transport',
        code: 'not_implemented',
        message: `transport.${kind} is not wired up in Phase 2.`,
      });
    },
  };
}

export function resolve(_project: { uploadTransport?: TransportKind }): Transport {
  return notImplemented('heygen');
}
