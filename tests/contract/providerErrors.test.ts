import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { ProviderError } from '@shared/errors.js';

// T138 — provider-error audit. Drives the real HTTP layer with mocked
// fetch() responses that mirror actual error bodies we have observed
// from ElevenLabs and HeyGen, then asserts:
//   * the resulting ProviderError carries the provider's verbatim
//     .message (FR-053), not a sanitised paraphrase;
//   * the correct `code` is set by status-class mapping;
//   * `nextStep` is non-empty (so every error the UI surfaces has a
//     concrete action).

vi.mock('@main/platform/keychain.js', () => ({
  get: vi.fn(async () => 'test-key'),
  set: vi.fn(async () => undefined),
  deletePassword: vi.fn(async () => undefined),
}));

const ORIG_FETCH = global.fetch;

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/errors');

interface FixtureCase {
  readonly file: string;
  readonly status: number;
  readonly expectedCode: string;
  readonly expectedMessage: RegExp;
  readonly provider: 'elevenlabs' | 'heygen';
}

const CASES: readonly FixtureCase[] = [
  {
    file: 'elevenlabs-401-unauthorized.json',
    status: 401,
    expectedCode: 'unauthorized',
    expectedMessage: /API key is invalid/,
    provider: 'elevenlabs',
  },
  {
    file: 'elevenlabs-429-rate-limit.json',
    status: 429,
    expectedCode: 'rate_limited',
    expectedMessage: /monthly character quota/,
    provider: 'elevenlabs',
  },
  {
    file: 'heygen-400-invalid-audio-asset.json',
    status: 400,
    expectedCode: 'http_400',
    expectedMessage: /audio_asset_id not found/,
    provider: 'heygen',
  },
  {
    file: 'heygen-402-insufficient-credits.json',
    status: 402,
    expectedCode: 'http_402',
    expectedMessage: /Insufficient credits/,
    provider: 'heygen',
  },
  {
    file: 'heygen-500-internal.json',
    status: 500,
    expectedCode: 'provider_unavailable',
    expectedMessage: /Internal server error/,
    provider: 'heygen',
  },
  {
    // ElevenLabs 422 body nests detail as an object rather than a string;
    // parseProviderMessage falls through to the raw text, which still
    // contains the verbatim upstream message.
    file: 'elevenlabs-422-validation.json',
    status: 422,
    expectedCode: 'http_422',
    expectedMessage: /UnknownVoice123/,
    provider: 'elevenlabs',
  },
];

async function drive(provider: 'elevenlabs' | 'heygen', status: number, body: string) {
  // Build a fetch stub returning the fixture body with the given status.
  const fakeResponse: Response = {
    ok: false,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => body,
  } as unknown as Response;
  global.fetch = vi.fn(async () => fakeResponse) as typeof fetch;

  const { request } = await import('@main/providers/http.js');
  try {
    await request({
      provider,
      method: 'GET',
      url: 'https://example.test/resource',
    });
    throw new Error('expected a ProviderError to be thrown');
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    return err;
  }
}

describe('provider error audit (FR-053 verbatim-message invariant)', () => {
  beforeEach(() => {
    // Fresh mocks per case.
  });

  afterEach(() => {
    global.fetch = ORIG_FETCH;
    vi.restoreAllMocks();
  });

  for (const c of CASES) {
    it(`${c.file} → code=${c.expectedCode}, verbatim message preserved`, async () => {
      const body = readFileSync(path.resolve(FIXTURES_DIR, c.file), 'utf-8');
      const err = await drive(c.provider, c.status, body);
      expect(err.provider).toBe(c.provider);
      expect(err.code).toBe(c.expectedCode);
      expect(err.message).toMatch(c.expectedMessage);
      expect(err.nextStep).toBeTruthy();
      expect(err.nextStep!.length).toBeGreaterThan(0);
    });
  }

  it('every fixture file under tests/fixtures/errors is covered by a case', () => {
    const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
    const covered = new Set(CASES.map((c) => c.file));
    const uncovered = files.filter((f) => !covered.has(f));
    expect(uncovered).toEqual([]);
  });
});
