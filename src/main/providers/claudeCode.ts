import { spawn } from 'node:child_process';
import { logger } from '@main/logging/jsonl.js';
import { ProviderError } from '@shared/errors.js';
import type { ClaudeVerifyResult } from '@shared/schemas/claudeCode.js';

// Real implementation per plan.md §Technical Requirements → FR-001 + FR-010.
// Shape: one subprocess per invocation, no long-lived session (per research
// decision — stream-json mode is under-documented).

export interface ClaudeInvokeOptions {
  model: string;
  systemPrompt?: string;
  prompt: string;
  outputFormat: 'json' | 'text';
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ClaudeInvokeResult<T = unknown> {
  raw: string;
  parsed: T;
  durationMs: number;
  stderr: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const STDIN_THRESHOLD_BYTES = 4 * 1024;

const AUTH_FAILURE_PATTERNS: readonly RegExp[] = [
  /\bnot logged in\b/i,
  /\bunauthori[sz]ed\b/i,
  /\b401\b/,
  /please run .*\bclaude\b.*\/login\b/i,
  /\bauthentication failed\b/i,
];

export async function invoke<T = unknown>(
  opts: ClaudeInvokeOptions,
): Promise<ClaudeInvokeResult<T>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const args = ['--print', '--output-format', opts.outputFormat, '--model', opts.model];
  const promptForStdin = Buffer.byteLength(opts.prompt, 'utf-8') > STDIN_THRESHOLD_BYTES;
  const promptForArg = promptForStdin ? undefined : opts.prompt;

  if (opts.systemPrompt) {
    args.push('--system-prompt', opts.systemPrompt);
  }

  const startedAt = Date.now();
  return new Promise<ClaudeInvokeResult<T>>((resolvePromise, reject) => {
    const child = spawn('claude', promptForArg ? [...args, promptForArg] : args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        new ProviderError({
          provider: 'claudeCode',
          code: 'timeout',
          message: `Claude Code did not respond within ${timeoutMs}ms.`,
          nextStep: 'Retry with a shorter prompt or increase the per-call timeout in settings.',
        }),
      );
    }, timeoutMs);

    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1_000).unref();
      reject(
        new ProviderError({
          provider: 'claudeCode',
          code: 'aborted',
          message: 'Claude Code invocation was cancelled.',
        }),
      );
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      stdoutBuf += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderrBuf += chunk;
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT';
      reject(
        new ProviderError({
          provider: 'claudeCode',
          code: missing ? 'not_installed' : 'spawn_failed',
          message: missing
            ? 'Claude Code CLI not found on PATH.'
            : `Failed to spawn Claude Code: ${err.message}`,
          nextStep: missing
            ? 'Install with `winget install Anthropic.Claude`, then `claude /login`.'
            : 'Check that the `claude` executable has execute permission.',
          cause: err,
        }),
      );
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);

      const durationMs = Date.now() - startedAt;
      if (stderrBuf.length > 0) {
        logger.debug('claudeCode.stderr', { stderr: stderrBuf, durationMs });
      }

      if (code !== 0) {
        reject(
          new ProviderError({
            provider: 'claudeCode',
            code: 'non_zero_exit',
            message: stderrBuf.trim() || `Claude Code exited ${code}.`,
            nextStep:
              'Re-run with log level debug to capture the full stderr, or check `claude --version`.',
          }),
        );
        return;
      }

      if (opts.outputFormat === 'json') {
        try {
          const parsed = JSON.parse(stdoutBuf) as T;
          resolvePromise({ raw: stdoutBuf, parsed, durationMs, stderr: stderrBuf });
        } catch (cause) {
          reject(
            new ProviderError({
              provider: 'claudeCode',
              code: 'invalid_json',
              message: 'Claude Code returned non-JSON output under --output-format json.',
              nextStep:
                'Check the system prompt; the model likely narrated instead of emitting JSON.',
              cause,
            }),
          );
        }
        return;
      }

      resolvePromise({
        raw: stdoutBuf,
        parsed: stdoutBuf as unknown as T,
        durationMs,
        stderr: stderrBuf,
      });
    });

    if (promptForStdin) {
      child.stdin.end(opts.prompt, 'utf-8');
    } else {
      child.stdin.end();
    }
  });
}

export async function verifyInstalled(): Promise<ClaudeVerifyResult> {
  // (a) installed probe: `claude --version`.
  const version = await probeVersion();
  if (!version) {
    return { installed: false, authenticated: false, reason: 'binary_not_found' };
  }
  // (b) authenticated probe: trivial --print call with a short timeout. Classify
  // outcome per FR-001.
  try {
    const res = await invoke<{ content?: unknown } | unknown>({
      model: 'claude-opus-4-7',
      prompt: 'Reply with the single character "y" and nothing else.',
      outputFormat: 'json',
      timeoutMs: 5_000,
    });
    // Valid JSON response means Claude Code accepted the call under the
    // operator's existing auth. We don't need to verify the body content.
    void res;
    return { installed: true, authenticated: true, version };
  } catch (err) {
    if (err instanceof ProviderError) {
      if (err.code === 'non_zero_exit' || err.code === 'timeout') {
        const stderr = (err.message ?? '').toLowerCase();
        const looksLikeAuthFail = AUTH_FAILURE_PATTERNS.some((re) => re.test(stderr));
        if (looksLikeAuthFail) {
          return { installed: true, authenticated: false, version, reason: 'auth_failure' };
        }
        // Installed but we couldn't classify the outcome — treat as
        // authenticated-with-warning so the operator isn't blocked on an
        // infrastructure hiccup. Home can still surface a soft banner.
        return {
          installed: true,
          authenticated: true,
          version,
          reason: 'installed_but_unclassified',
        };
      }
      if (err.code === 'not_installed') {
        return { installed: false, authenticated: false, reason: 'binary_not_found' };
      }
    }
    logger.warn('claudeCode.verifyInstalled unexpected error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { installed: true, authenticated: true, version, reason: 'probe_error_soft' };
  }
}

async function probeVersion(): Promise<string | null> {
  return new Promise<string | null>((resolvePromise) => {
    const child = spawn('claude', ['--version'], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (c: string) => {
      out += c;
    });
    child.on('error', () => resolvePromise(null));
    child.on('close', (code) => {
      if (code !== 0) {
        resolvePromise(null);
        return;
      }
      const trimmed = out.trim();
      resolvePromise(trimmed.length > 0 ? trimmed : 'unknown');
    });
    // Defensive timeout — --version should be near-instant.
    setTimeout(() => {
      if (!child.killed) child.kill();
      resolvePromise(null);
    }, 5_000).unref();
  });
}
