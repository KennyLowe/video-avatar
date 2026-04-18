import { ProviderError } from '@shared/errors.js';

// Poll-until-terminal with transient-error retries. Every long-running
// provider operation (avatar video, voice training, avatar training, render)
// follows the same pattern — fetch status, check if it's a terminal state,
// retry transient failures, eventually time out. Owning this in one place
// means retry policy and back-off math live behind one test surface.

export type PollStatus<T> =
  | { kind: 'pending' }
  | { kind: 'done'; value: T }
  | { kind: 'failed'; error: string };

export interface PollOptions {
  readonly signal: AbortSignal;
  /** Time between polls when the provider says `pending`. */
  readonly pollIntervalMs: number;
  /** Hard wall-clock cap. Throws on timeout. */
  readonly timeoutMs: number;
  /**
   * Human-readable identifier used in timeout and cancellation messages —
   * e.g. `HeyGen video vid_abc123`. Appears in operator-facing error text.
   */
  readonly label: string;
  /**
   * Optional observer fired on each transient-error retry, before the
   * back-off sleep. Use it to log to the JSONL structured log.
   */
  readonly onTransientRetry?: (info: { attempt: number; backoffMs: number; code: string }) => void;
}

// Provider error codes that represent a transient condition and should be
// retried inside the poll loop rather than failing the whole job. Anything
// else (401, 403, invalid_upload_response, …) is a hard failure.
export const TRANSIENT_ERROR_CODES: ReadonlySet<string> = new Set([
  'rate_limited',
  'provider_unavailable',
  'timeout',
  'network_error',
]);

// Back-off schedule for transient errors. Caps at ~62 s total, resets after
// a successful call so flapping providers don't burn the budget.
const TRANSIENT_BACKOFF_MS: readonly number[] = [2_000, 4_000, 8_000, 16_000, 32_000];

/**
 * Poll `fetchStatus` until it reports a terminal state or the abort / timeout
 * trips. Returns the value carried by the `done` status, or throws:
 *   - terminal `failed` → Error with the provider message.
 *   - timeout → Error naming the label.
 *   - abort → Error "<label> was cancelled.".
 *   - non-transient ProviderError → rethrown unchanged.
 *   - transient retries exhausted → the last ProviderError.
 */
export async function pollUntilTerminal<T>(
  fetchStatus: () => Promise<PollStatus<T>>,
  options: PollOptions,
): Promise<T> {
  const startedAt = Date.now();
  let transientFailures = 0;

  while (!options.signal.aborted) {
    if (Date.now() - startedAt > options.timeoutMs) {
      throw new Error(
        `Timed out waiting for ${options.label} after ${Math.round(options.timeoutMs / 1000)} seconds.`,
      );
    }

    try {
      const status = await fetchStatus();
      transientFailures = 0;

      if (status.kind === 'done') return status.value;
      if (status.kind === 'failed') {
        throw new Error(`${options.label} failed: ${status.error}`);
      }
      await sleep(options.pollIntervalMs, options.signal);
    } catch (err) {
      // Abort fires "aborted" from our sleep helper; translate into the
      // labelled cancellation message so callers see a consistent error shape.
      if (options.signal.aborted) {
        throw new Error(`${options.label} was cancelled.`);
      }
      if (!isTransientProviderError(err) || transientFailures >= TRANSIENT_BACKOFF_MS.length) {
        throw err;
      }
      const backoffMs = TRANSIENT_BACKOFF_MS[transientFailures] ?? options.pollIntervalMs;
      transientFailures += 1;
      options.onTransientRetry?.({
        attempt: transientFailures,
        backoffMs,
        code: (err as ProviderError).code,
      });
      await sleep(backoffMs, options.signal);
    }
  }

  throw new Error(`${options.label} was cancelled.`);
}

function isTransientProviderError(err: unknown): boolean {
  return err instanceof ProviderError && TRANSIENT_ERROR_CODES.has(err.code);
}

/** Sleep `ms` milliseconds; reject early if `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}
