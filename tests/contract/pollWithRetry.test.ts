import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@shared/errors.js';
import { pollUntilTerminal } from '@main/workers/pollWithRetry.js';

// Pin the contract of the shared poll helper. Every long-running provider
// job relies on these invariants — terminal state, abort behaviour, timeout,
// transient retries, hard failures.

const BASE_OPTIONS = {
  pollIntervalMs: 1_000,
  timeoutMs: 60_000,
  label: 'test op',
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('pollUntilTerminal', () => {
  it('returns immediately when the first fetch is `done`', async () => {
    const ctrl = new AbortController();
    const fetcher = vi.fn().mockResolvedValue({ kind: 'done', value: 'hello' });
    const result = await pollUntilTerminal<string>(fetcher, {
      ...BASE_OPTIONS,
      signal: ctrl.signal,
    });
    expect(result).toBe('hello');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('polls through pending states until a terminal done', async () => {
    const ctrl = new AbortController();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'pending' })
      .mockResolvedValueOnce({ kind: 'pending' })
      .mockResolvedValueOnce({ kind: 'done', value: 42 });

    const promise = pollUntilTerminal<number>(fetcher, {
      ...BASE_OPTIONS,
      signal: ctrl.signal,
    });

    // Drive the two pending→pending→done sequence forward.
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(promise).resolves.toBe(42);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('throws a labelled error on terminal failed', async () => {
    const ctrl = new AbortController();
    const fetcher = vi.fn().mockResolvedValue({ kind: 'failed', error: 'render exploded' });
    await expect(
      pollUntilTerminal(fetcher, { ...BASE_OPTIONS, signal: ctrl.signal }),
    ).rejects.toThrow('test op failed: render exploded');
  });

  it('retries transient ProviderError codes with exponential back-off', async () => {
    const ctrl = new AbortController();
    const transient = new ProviderError({
      provider: 'heygen',
      code: 'rate_limited',
      message: 'slow down',
    });
    const retrySpy = vi.fn();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(transient)
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce({ kind: 'done', value: 'ok' });

    const promise = pollUntilTerminal<string>(fetcher, {
      ...BASE_OPTIONS,
      signal: ctrl.signal,
      onTransientRetry: retrySpy,
    });

    // 2 s back-off, then 4 s back-off, then success.
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(promise).resolves.toBe('ok');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(retrySpy).toHaveBeenNthCalledWith(1, {
      attempt: 1,
      backoffMs: 2_000,
      code: 'rate_limited',
    });
    expect(retrySpy).toHaveBeenNthCalledWith(2, {
      attempt: 2,
      backoffMs: 4_000,
      code: 'rate_limited',
    });
  });

  it('exhausts transient retries and rethrows the last error', async () => {
    const ctrl = new AbortController();
    const transient = new ProviderError({
      provider: 'heygen',
      code: 'provider_unavailable',
      message: 'down',
    });
    const fetcher = vi.fn().mockRejectedValue(transient);

    // timeoutMs is explicitly > sum of the back-off ladder (62 s) so this
    // test exercises the exhaustion branch, not the timeout branch.
    const promise = pollUntilTerminal(fetcher, {
      ...BASE_OPTIONS,
      timeoutMs: 120_000,
      signal: ctrl.signal,
    });
    const caught = promise.catch((e) => e);

    // Five back-offs: 2, 4, 8, 16, 32 seconds.
    for (const ms of [2_000, 4_000, 8_000, 16_000, 32_000]) {
      await vi.advanceTimersByTimeAsync(ms);
    }
    const err = await caught;
    expect(err).toBe(transient);
    // 5 retry attempts + the final failed call that wasn't retried = 6.
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it('rethrows a non-transient ProviderError immediately', async () => {
    const ctrl = new AbortController();
    const fatal = new ProviderError({
      provider: 'heygen',
      code: 'unauthorized',
      message: 'bad key',
    });
    const fetcher = vi.fn().mockRejectedValue(fatal);
    await expect(pollUntilTerminal(fetcher, { ...BASE_OPTIONS, signal: ctrl.signal })).rejects.toBe(
      fatal,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('throws a cancellation error when the signal aborts mid-wait', async () => {
    const ctrl = new AbortController();
    const fetcher = vi.fn().mockResolvedValue({ kind: 'pending' });

    const promise = pollUntilTerminal(fetcher, {
      ...BASE_OPTIONS,
      signal: ctrl.signal,
    });
    const caught = promise.catch((e) => e);
    // Let the first fetch complete (microtask queue) before aborting.
    await Promise.resolve();
    await Promise.resolve();
    ctrl.abort();
    await vi.advanceTimersByTimeAsync(10);

    const err = await caught;
    expect((err as Error).message).toMatch(/test op (was cancelled|aborted)/);
  });

  it('throws on timeout', async () => {
    const ctrl = new AbortController();
    const fetcher = vi.fn().mockResolvedValue({ kind: 'pending' });

    const promise = pollUntilTerminal(fetcher, {
      ...BASE_OPTIONS,
      timeoutMs: 5_000,
      signal: ctrl.signal,
    });
    const caught = promise.catch((e) => e);
    // Advance past the timeout.
    for (let i = 0; i < 10; i += 1) {
      await vi.advanceTimersByTimeAsync(1_000);
    }
    const err = await caught;
    expect((err as Error).message).toMatch(/Timed out waiting for test op/);
  });
});
