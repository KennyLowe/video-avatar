// Universal error type thrown by every provider wrapper and surfaced across
// the IPC boundary. The renderer sees `{ code, message, provider?, cause? }`
// and nothing more; no Node primitives cross the wire.
//
// Constitutional references:
// - Principle #5 "Errors are explicit, actionable, and verbatim"
// - FR-053: provider's verbatim message + one concrete next step

export type ProviderName =
  | 'claudeCode'
  | 'elevenlabs'
  | 'heygen'
  | 'remotion'
  | 'transport'
  | 's3'
  | 'r2'
  | 'cloudflared';

export interface ProviderErrorShape {
  readonly name: 'ProviderError';
  readonly provider: ProviderName | null;
  readonly code: string;
  readonly message: string;
  readonly nextStep?: string;
  readonly cause?: unknown;
}

export class ProviderError extends Error implements ProviderErrorShape {
  public override readonly name = 'ProviderError' as const;
  public readonly provider: ProviderName | null;
  public readonly code: string;
  public readonly nextStep?: string;
  public override readonly cause?: unknown;

  constructor(init: {
    provider: ProviderName | null;
    code: string;
    message: string;
    nextStep?: string;
    cause?: unknown;
  }) {
    super(init.message);
    this.provider = init.provider;
    this.code = init.code;
    if (init.nextStep !== undefined) this.nextStep = init.nextStep;
    if (init.cause !== undefined) this.cause = init.cause;
  }

  toJSON(): ProviderErrorShape {
    return {
      name: this.name,
      provider: this.provider,
      code: this.code,
      message: this.message,
      ...(this.nextStep !== undefined ? { nextStep: this.nextStep } : {}),
    };
  }
}

export function isProviderError(value: unknown): value is ProviderError {
  return value instanceof ProviderError;
}

/** Narrow any unknown throwable down to a plain shape safe for IPC. */
export function toErrorShape(value: unknown): ProviderErrorShape {
  if (isProviderError(value)) return value.toJSON();
  if (value instanceof Error) {
    return { name: 'ProviderError', provider: null, code: 'unknown', message: value.message };
  }
  return { name: 'ProviderError', provider: null, code: 'unknown', message: String(value) };
}
