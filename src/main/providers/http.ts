import { ProviderError, type ProviderName } from '@shared/errors.js';
import { logger } from '@main/logging/jsonl.js';

// Shared HTTP helper. Native fetch (Node 20+). Never called outside
// src/main/providers/** (Non-negotiable #5 — enforced by the
// lumo/no-inline-fetch ESLint rule).
//
// All provider wrappers map the raw Response into either a typed ProviderError
// or a parsed success. No retries — retry policy lives in the job worker, not
// the wrapper layer (per contracts/provider-wrappers.md).

// RequestInit['body'] covers everything fetch accepts without dragging in
// the DOM lib. Buffer is runtime-compatible with Uint8Array.
type RawBody = NonNullable<RequestInit['body']>;

export interface HttpRequest {
  readonly provider: ProviderName;
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly body?: RawBody | Record<string, unknown> | Buffer;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly expect?: 'json' | 'binary' | 'empty';
}

export interface HttpResult<T = unknown> {
  readonly status: number;
  readonly headers: Headers;
  readonly body: T;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export async function request<T = unknown>(req: HttpRequest): Promise<HttpResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  if (req.signal) {
    if (req.signal.aborted) controller.abort();
    else req.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const init: RequestInit = {
    method: req.method,
    signal: controller.signal,
    headers: buildHeaders(req.headers, req.body),
  };
  if (req.body !== undefined) init.body = serializeBody(req.body);

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(req.url, init);
  } catch (cause) {
    clearTimeout(timeout);
    if (controller.signal.aborted) {
      throw new ProviderError({
        provider: req.provider,
        code: 'timeout',
        message: `${req.provider} request timed out after ${req.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms.`,
        nextStep:
          'Retry the operation; if it persists, check your network and the provider status page.',
        cause,
      });
    }
    throw new ProviderError({
      provider: req.provider,
      code: 'network_error',
      message: `Could not reach ${req.provider}: ${(cause as Error).message}`,
      nextStep: 'Check your network connection and the provider status page.',
      cause,
    });
  } finally {
    clearTimeout(timeout);
  }

  const durationMs = Date.now() - startedAt;
  logger.debug(`${req.provider}.http`, {
    method: req.method,
    url: req.url,
    status: response.status,
    durationMs,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw mapHttpFailure(req.provider, response.status, text);
  }

  if (req.expect === 'empty') {
    return { status: response.status, headers: response.headers, body: undefined as T };
  }
  if (req.expect === 'binary') {
    const buf = Buffer.from(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, body: buf as T };
  }
  const text = await response.text();
  if (text.length === 0) {
    return { status: response.status, headers: response.headers, body: undefined as T };
  }
  try {
    return {
      status: response.status,
      headers: response.headers,
      body: JSON.parse(text) as T,
    };
  } catch (cause) {
    throw new ProviderError({
      provider: req.provider,
      code: 'invalid_json',
      message: `${req.provider} returned non-JSON on a success response.`,
      nextStep: 'Retry, then check the provider status page if it persists.',
      cause,
    });
  }
}

function buildHeaders(
  custom: Record<string, string> | undefined,
  body: HttpRequest['body'],
): Record<string, string> {
  const headers: Record<string, string> = { ...custom };
  if (body !== undefined && !(body instanceof Buffer) && !(typeof body === 'string')) {
    if (!headerSet(headers, 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
  }
  return headers;
}

function headerSet(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}

function serializeBody(body: NonNullable<HttpRequest['body']>): RawBody {
  // fetch's BodyInit union is sensitive to the parameterised Uint8Array in
  // TS 5.5+; we cast at the boundary rather than propagate the variance
  // through every caller. Runtime behaviour is identical.
  if (Buffer.isBuffer(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength) as unknown as RawBody;
  }
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return body as unknown as RawBody;
  if (body instanceof ArrayBuffer) return body as unknown as RawBody;
  if (body instanceof FormData || body instanceof URLSearchParams) return body;
  return JSON.stringify(body);
}

function mapHttpFailure(provider: ProviderName, status: number, text: string): ProviderError {
  const message = parseProviderMessage(text) ?? `${provider} responded with ${status}.`;
  const nextStep = nextStepForStatus(provider, status);

  if (status === 401 || status === 403) {
    return new ProviderError({
      provider,
      code: status === 401 ? 'unauthorized' : 'forbidden',
      message,
      nextStep,
    });
  }
  if (status === 404) {
    return new ProviderError({ provider, code: 'not_found', message, nextStep });
  }
  if (status === 413) {
    return new ProviderError({ provider, code: 'payload_too_large', message, nextStep });
  }
  if (status === 429) {
    return new ProviderError({ provider, code: 'rate_limited', message, nextStep });
  }
  if (status >= 500) {
    return new ProviderError({ provider, code: 'provider_unavailable', message, nextStep });
  }
  return new ProviderError({ provider, code: `http_${status}`, message, nextStep });
}

function parseProviderMessage(text: string): string | null {
  if (text.length === 0) return null;
  try {
    const obj = JSON.parse(text) as { detail?: unknown; message?: unknown; error?: unknown };
    if (typeof obj.detail === 'string') return obj.detail;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
    if (obj.error && typeof obj.error === 'object') {
      const err = obj.error as { message?: unknown };
      if (typeof err.message === 'string') return err.message;
    }
    return text.length <= 400 ? text : null;
  } catch {
    return text.length <= 400 ? text : null;
  }
}

function nextStepForStatus(provider: ProviderName, status: number): string {
  if (status === 401 || status === 403) {
    return `Open Settings → Providers and re-enter your ${provider} credential, then click Test.`;
  }
  if (status === 429) return `Wait a minute and retry — you've hit ${provider}'s rate limit.`;
  if (status === 413)
    return 'The payload is too large for this provider; shorten the input and retry.';
  if (status >= 500)
    return `${provider} is reporting a server error. Retry shortly; check status.${provider}.com if it persists.`;
  return 'Check the error above; if it persists, open a provider support ticket with the provider error id.';
}
