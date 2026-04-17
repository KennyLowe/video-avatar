import type { LumoBridge, IpcEnvelope } from '@shared/ipc-types.js';

declare global {
  interface Window {
    readonly lumo: LumoBridge;
  }
}

// Unwraps the IpcEnvelope; throws the error's message on failure so React
// components can use try/catch or error boundaries rather than manually
// inspecting `{ ok }` fields.
export async function unwrap<T>(call: Promise<IpcEnvelope<T>>): Promise<T> {
  const envelope = await call;
  if (envelope.ok) return envelope.value;
  const err = new Error(envelope.error.message);
  (err as Error & { code?: string; provider?: string | null }).code = envelope.error.code;
  (err as Error & { code?: string; provider?: string | null }).provider = envelope.error.provider;
  throw err;
}

export const lumo = new Proxy({} as LumoBridge, {
  get(_target, prop: string) {
    return (window as unknown as Window).lumo[prop as keyof LumoBridge];
  },
});
