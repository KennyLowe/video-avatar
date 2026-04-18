import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as keytar from 'keytar';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as heygen from '@main/providers/heygen.js';

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

beforeEach(() => {
  getPasswordMock.mockReset();
  getPasswordMock.mockResolvedValue('hg-test-key-0123456789abcdef0123456789');
  tmpDir = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-hg-train-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('heygen.createPhotoAvatar', () => {
  it('uploads the portrait then POSTs /v2/photo_avatar/train with the image_key', async () => {
    const imagePath = path.resolve(tmpDir, 'face.png');
    writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const seen: { uploadUrl?: string; uploadContentType?: string | null; trainBody?: unknown } = {};
    mockFetch([
      async (req) => {
        seen.uploadUrl = req.url;
        seen.uploadContentType = req.headers.get('content-type');
        await req.arrayBuffer();
        return jsonResponse(200, { data: { id: 'img_key_123' } });
      },
      async (req) => {
        seen.trainBody = await req.json();
        return jsonResponse(200, { data: { avatar_id: 'av_photo_42' } });
      },
    ]);

    const res = await heygen.createPhotoAvatar({ imagePath, name: 'My Face' });
    expect(res).toEqual({ avatarId: 'av_photo_42' });
    expect(seen.uploadUrl).toBe('https://upload.heygen.com/v1/asset');
    expect(seen.uploadContentType).toBe('image/png');
    expect(seen.trainBody).toEqual({ image_key: 'img_key_123', name: 'My Face' });
  });

  it('throws invalid_upload_response when the upload response is missing an id', async () => {
    const imagePath = path.resolve(tmpDir, 'bad.png');
    writeFileSync(imagePath, Buffer.from([0]));
    mockFetch([jsonResponse(200, { data: {} })]);
    await expect(heygen.createPhotoAvatar({ imagePath, name: 'X' })).rejects.toMatchObject({
      provider: 'heygen',
      code: 'invalid_upload_response',
    });
  });
});

describe('heygen.createInstantAvatar', () => {
  it('uploads every segment then POSTs /v2/video_avatar/train with the video_keys', async () => {
    const a = path.resolve(tmpDir, 'a.mp4');
    const b = path.resolve(tmpDir, 'b.mp4');
    writeFileSync(a, Buffer.from([0x00]));
    writeFileSync(b, Buffer.from([0x01]));
    const keys: string[] = [];
    let trainBody: unknown = null;
    mockFetch([
      async (req) => {
        await req.arrayBuffer();
        keys.push('seg_key_a');
        return jsonResponse(200, { data: { id: 'seg_key_a' } });
      },
      async (req) => {
        await req.arrayBuffer();
        keys.push('seg_key_b');
        return jsonResponse(200, { data: { id: 'seg_key_b' } });
      },
      async (req) => {
        trainBody = await req.json();
        return jsonResponse(200, { data: { avatar_id: 'av_inst_9' } });
      },
    ]);
    const res = await heygen.createInstantAvatar({ segmentPaths: [a, b], name: 'Me' });
    expect(res).toEqual({ avatarId: 'av_inst_9' });
    expect(keys).toEqual(['seg_key_a', 'seg_key_b']);
    expect(trainBody).toEqual({ video_keys: ['seg_key_a', 'seg_key_b'], name: 'Me' });
  });
});

describe('heygen.getAvatarStatus', () => {
  it('maps completed / ready / succeeded → ready', async () => {
    mockFetch([
      jsonResponse(200, { data: { status: 'completed' } }),
      jsonResponse(200, { data: { status: 'ready' } }),
      jsonResponse(200, { data: { status: 'succeeded' } }),
    ]);
    expect(await heygen.getAvatarStatus('a1')).toBe('ready');
    expect(await heygen.getAvatarStatus('a2')).toBe('ready');
    expect(await heygen.getAvatarStatus('a3')).toBe('ready');
  });

  it('maps failed / error → failed', async () => {
    mockFetch([
      jsonResponse(200, { data: { status: 'failed' } }),
      jsonResponse(200, { data: { status: 'error' } }),
    ]);
    expect(await heygen.getAvatarStatus('a1')).toBe('failed');
    expect(await heygen.getAvatarStatus('a2')).toBe('failed');
  });

  it('defaults unknown / in-progress states to training', async () => {
    mockFetch([
      jsonResponse(200, { data: { status: 'processing' } }),
      jsonResponse(200, { data: { status: '' } }),
      jsonResponse(200, {}),
    ]);
    expect(await heygen.getAvatarStatus('a1')).toBe('training');
    expect(await heygen.getAvatarStatus('a2')).toBe('training');
    expect(await heygen.getAvatarStatus('a3')).toBe('training');
  });
});
