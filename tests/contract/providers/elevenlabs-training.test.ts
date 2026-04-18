import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as keytar from 'keytar';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
    if (typeof handler === 'function')
      return handler(new Request(input as RequestInfo, init as RequestInit | undefined));
    return handler;
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let tmpDir: string;
let sampleWav: string;

beforeEach(() => {
  getPasswordMock.mockReset();
  getPasswordMock.mockResolvedValue('xi-test-key-0123456789abcdef0123456789abcdef');
  elevenlabs.__resetForTests();
  tmpDir = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-eleven-train-'));
  sampleWav = path.resolve(tmpDir, 'sample.wav');
  writeFileSync(sampleWav, Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('elevenlabs.createIVC', () => {
  it('POSTs multipart to /v1/voices/add and returns the voice_id', async () => {
    const seen: {
      url?: string;
      method?: string;
      xApi?: string | null;
      contentType?: string | null;
    } = {};
    mockFetch([
      async (req) => {
        seen.url = req.url;
        seen.method = req.method;
        seen.xApi = req.headers.get('xi-api-key');
        seen.contentType = req.headers.get('content-type');
        // Consume the body so the mock behaves like real fetch.
        await req.text();
        return jsonResponse(200, { voice_id: 'v_ivc_abc' });
      },
    ]);
    const res = await elevenlabs.createIVC({ name: 'Test IVC', files: [sampleWav] });
    expect(res).toEqual({ voiceId: 'v_ivc_abc' });
    expect(seen.url).toBe('https://api.elevenlabs.io/v1/voices/add');
    expect(seen.method).toBe('POST');
    expect(seen.xApi).toBe('xi-test-key-0123456789abcdef0123456789abcdef');
    // fetch assigns the multipart boundary; the header should start with multipart/form-data.
    expect(seen.contentType ?? '').toMatch(/^multipart\/form-data/);
  });

  it('throws invalid_ivc_response when voice_id is missing', async () => {
    mockFetch([jsonResponse(200, {})]);
    await expect(elevenlabs.createIVC({ name: 'No id', files: [sampleWav] })).rejects.toMatchObject(
      { provider: 'elevenlabs', code: 'invalid_ivc_response' },
    );
  });
});

describe('elevenlabs.createPVC', () => {
  it('POSTs multipart to /v1/voices/pvc/create', async () => {
    let seenUrl = '';
    mockFetch([
      async (req) => {
        seenUrl = req.url;
        await req.text();
        return jsonResponse(200, { voice_id: 'v_pvc_42' });
      },
    ]);
    const res = await elevenlabs.createPVC({ name: 'Test PVC', files: [sampleWav] });
    expect(res).toEqual({ voiceId: 'v_pvc_42' });
    expect(seenUrl).toBe('https://api.elevenlabs.io/v1/voices/pvc/create');
  });
});

describe('elevenlabs.getVoiceStatus', () => {
  it('normalises fine_tuning.state variants', async () => {
    mockFetch([
      jsonResponse(200, { fine_tuning: { state: 'fine_tuned' } }),
      jsonResponse(200, { fine_tuning: { state: 'failed' } }),
      jsonResponse(200, { fine_tuning: { state: 'not_started' } }),
      jsonResponse(200, { status: 'ready' }),
    ]);
    expect(await elevenlabs.getVoiceStatus('v_1')).toBe('ready');
    expect(await elevenlabs.getVoiceStatus('v_2')).toBe('failed');
    expect(await elevenlabs.getVoiceStatus('v_3')).toBe('training');
    expect(await elevenlabs.getVoiceStatus('v_4')).toBe('ready');
  });

  it('URL-encodes the voice id segment', async () => {
    let seen = '';
    mockFetch([
      (req) => {
        seen = req.url;
        return jsonResponse(200, { status: 'ready' });
      },
    ]);
    await elevenlabs.getVoiceStatus('abc/def 123');
    expect(seen).toBe('https://api.elevenlabs.io/v1/voices/abc%2Fdef%20123');
  });
});
