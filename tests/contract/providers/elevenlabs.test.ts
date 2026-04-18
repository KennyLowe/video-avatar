import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as keytar from 'keytar';
import * as elevenlabs from '@main/providers/elevenlabs.js';

vi.mock('keytar', () => ({
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
}));

const getPasswordMock = keytar.getPassword as unknown as ReturnType<typeof vi.fn>;

function mockFetch(
  responses: Array<Response | ((req: Request) => Response | Promise<Response>)>,
): void {
  let idx = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const handler = responses[idx] ?? responses[responses.length - 1];
    idx += 1;
    if (handler === undefined) throw new Error('no more mock fetch responses queued');
    if (typeof handler === 'function') {
      const req = new Request(input as RequestInfo, init as RequestInit | undefined);
      return handler(req);
    }
    return handler;
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function binaryResponse(status: number, bytes: Uint8Array): Response {
  return new Response(bytes as unknown as BodyInit, {
    status,
    headers: { 'content-type': 'audio/mpeg' },
  });
}

beforeEach(() => {
  getPasswordMock.mockReset();
  getPasswordMock.mockResolvedValue('xi-test-key-0123456789abcdef0123456789abcdef');
  elevenlabs.__resetForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('elevenlabs.testKey', () => {
  it('reports plan and month-to-date credits from the /v1/user payload', async () => {
    mockFetch([
      jsonResponse(200, {
        subscription: { tier: 'creator', character_limit: 100_000, character_count: 40_000 },
      }),
    ]);

    const res = await elevenlabs.testKey();
    expect(res).toEqual({ plan: 'creator', mtdCredits: 60_000 });
  });

  it('returns mtdCredits=null when the service omits a character quota', async () => {
    mockFetch([jsonResponse(200, { subscription: { tier: 'free' } })]);
    const res = await elevenlabs.testKey();
    expect(res).toEqual({ plan: 'free', mtdCredits: null });
  });

  it('maps a 401 into a ProviderError with an actionable next step', async () => {
    mockFetch([jsonResponse(401, { detail: 'Invalid API key' })]);
    await expect(elevenlabs.testKey()).rejects.toMatchObject({
      name: 'ProviderError',
      provider: 'elevenlabs',
      code: 'unauthorized',
      message: 'Invalid API key',
      nextStep: expect.stringContaining('re-enter'),
    });
  });

  it('throws a no_credential ProviderError when the keychain returns null', async () => {
    getPasswordMock.mockResolvedValue(null);
    await expect(elevenlabs.testKey()).rejects.toMatchObject({
      provider: 'elevenlabs',
      code: 'no_credential',
    });
  });
});

describe('elevenlabs.tts', () => {
  it('returns the binary MP3 payload and reports character count', async () => {
    const audio = new Uint8Array([0xff, 0xfb, 0x90, 0x64]);
    mockFetch([binaryResponse(200, audio)]);

    const res = await elevenlabs.tts({ voiceId: 'v1', text: 'hello world' });
    expect(res.characters).toBe('hello world'.length);
    expect(Buffer.compare(res.mp3, Buffer.from(audio))).toBe(0);
  });

  it('hits the correct URL and sends the xi-api-key header', async () => {
    let seen: Request | null = null;
    mockFetch([
      (req) => {
        seen = req.clone();
        return binaryResponse(200, new Uint8Array([0]));
      },
    ]);
    await elevenlabs.tts({ voiceId: 'my-voice', text: 'x' });
    expect(seen).not.toBeNull();
    expect(seen!.url).toBe('https://api.elevenlabs.io/v1/text-to-speech/my-voice');
    expect(seen!.headers.get('xi-api-key')).toBe('xi-test-key-0123456789abcdef0123456789abcdef');
  });
});

describe('elevenlabs.listStockVoices', () => {
  it('normalises the /v1/voices shape', async () => {
    mockFetch([
      jsonResponse(200, {
        voices: [
          { voice_id: 'v1', name: 'Rachel', preview_url: 'https://example/preview.mp3' },
          { voice_id: 'v2' },
        ],
      }),
    ]);
    const voices = await elevenlabs.listStockVoices();
    expect(voices).toEqual([
      { voiceId: 'v1', name: 'Rachel', preview: 'https://example/preview.mp3' },
      { voiceId: 'v2', name: 'Unnamed voice', preview: null },
    ]);
  });
});

describe('elevenlabs minimums', () => {
  it('returns the documented defaults per research.md §2', async () => {
    expect(await elevenlabs.getPvcMinimumSeconds()).toBe(1800);
    expect(await elevenlabs.getIvcMinimumSeconds()).toBe(60);
  });
});
