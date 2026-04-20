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
  tmpDir = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-heygen-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('heygen.testKey', () => {
  it('reports plan and current-period credits from /v2/user/remaining_quota', async () => {
    mockFetch([
      jsonResponse(200, {
        data: { plan_name: 'pro', remaining_quota: 800, total_quota: 1000 },
      }),
    ]);
    const res = await heygen.testKey();
    expect(res).toEqual({ plan: 'pro', mtdCredits: 200 });
  });

  it('returns null mtdCredits when total is not exposed', async () => {
    mockFetch([jsonResponse(200, { data: { plan_name: 'payg', remaining_quota: 500 } })]);
    const res = await heygen.testKey();
    expect(res).toEqual({ plan: 'payg', mtdCredits: 500 });
  });

  it('maps a 401 into an unauthorized ProviderError', async () => {
    mockFetch([jsonResponse(401, { error: { message: 'Invalid api key' } })]);
    await expect(heygen.testKey()).rejects.toMatchObject({
      provider: 'heygen',
      code: 'unauthorized',
      message: 'Invalid api key',
    });
  });
});

describe('heygen.uploadAudioAsset', () => {
  it('POSTs the raw binary body to upload.heygen.com with Content-Type: audio/mpeg', async () => {
    const audioPath = path.resolve(tmpDir, 'say.mp3');
    writeFileSync(audioPath, Buffer.from([0x49, 0x44, 0x33, 0x00, 0x00]));

    let seen: {
      url: string;
      contentType: string | null;
      xApiKey: string | null;
      byteLength: number;
    } | null = null;
    mockFetch([
      async (req) => {
        const buf = await req.arrayBuffer();
        seen = {
          url: req.url,
          contentType: req.headers.get('content-type'),
          xApiKey: req.headers.get('x-api-key'),
          byteLength: buf.byteLength,
        };
        return jsonResponse(200, { data: { id: 'asset_abc' } });
      },
    ]);

    const res = await heygen.uploadAudioAsset(audioPath);
    expect(res).toEqual({ assetId: 'asset_abc' });
    expect(seen).toEqual({
      url: 'https://upload.heygen.com/v1/asset',
      contentType: 'audio/mpeg',
      xApiKey: 'hg-test-key-0123456789abcdef0123456789',
      byteLength: 5,
    });
  });

  it('throws invalid_upload_response when the asset id is missing', async () => {
    const p = path.resolve(tmpDir, 'bad.mp3');
    writeFileSync(p, Buffer.from([0]));
    mockFetch([jsonResponse(200, { data: {} })]);
    await expect(heygen.uploadAudioAsset(p)).rejects.toMatchObject({
      provider: 'heygen',
      code: 'invalid_upload_response',
    });
  });
});

describe('heygen.generateVideo', () => {
  it('hits /v2/video/generate for Standard with the expected payload shape', async () => {
    let seenBody: unknown = null;
    mockFetch([
      async (req) => {
        seenBody = await req.json();
        return jsonResponse(200, { data: { video_id: 'vid_standard' } });
      },
    ]);
    const res = await heygen.generateVideo({
      avatarId: 'av-42',
      audioAssetId: 'asset-42',
      mode: 'standard',
      title: 'Script Title',
    });
    expect(res).toEqual({ videoJobId: 'vid_standard' });
    expect(seenBody).toEqual({
      video_inputs: [
        {
          character: { type: 'avatar', avatar_id: 'av-42' },
          voice: { type: 'audio', audio_asset_id: 'asset-42' },
        },
      ],
      dimension: { width: 1920, height: 1080 },
      video_title: 'Script Title',
    });
  });

  it('falls back to a safe default title when none is provided', async () => {
    let seenBody: unknown = null;
    mockFetch([
      async (req) => {
        seenBody = await req.json();
        return jsonResponse(200, { data: { video_id: 'vid_notitle' } });
      },
    ]);
    await heygen.generateVideo({
      avatarId: 'a',
      audioAssetId: 'b',
      mode: 'standard',
    });
    expect((seenBody as { video_title?: string }).video_title).toBe('Lumo render');
  });

  it('sends character.type=talking_photo + talking_photo_id for trained Photo Avatars', async () => {
    let seenBody: unknown = null;
    mockFetch([
      async (req) => {
        seenBody = await req.json();
        return jsonResponse(200, { data: { video_id: 'vid_tp' } });
      },
    ]);
    await heygen.generateVideo({
      avatarId: 'tp-123',
      audioAssetId: 'asset-x',
      mode: 'standard',
      avatarKind: 'talking_photo',
      title: 'Trained shot',
    });
    const body = seenBody as {
      video_inputs: Array<{ character: { type: string; talking_photo_id?: string } }>;
    };
    expect(body.video_inputs[0]!.character).toEqual({
      type: 'talking_photo',
      talking_photo_id: 'tp-123',
    });
  });

  it('sanitises control characters, collapses whitespace, and clamps to 80 chars', async () => {
    let seenBody: unknown = null;
    mockFetch([
      async (req) => {
        seenBody = await req.json();
        return jsonResponse(200, { data: { video_id: 'vid_sanitised' } });
      },
    ]);
    await heygen.generateVideo({
      avatarId: 'a',
      audioAssetId: 'b',
      mode: 'standard',
      title: `Scene\n\n\twith\u0000control${'x'.repeat(200)}`,
    });
    const videoTitle = (seenBody as { video_title?: string }).video_title ?? '';
    expect(videoTitle.length).toBeLessThanOrEqual(80);
    // eslint-disable-next-line no-control-regex
    expect(videoTitle).not.toMatch(/[\u0000-\u001F]/);
    expect(videoTitle.startsWith('Scene with control')).toBe(true);
  });

  it('hits /v2/video/av4/generate for Avatar IV', async () => {
    let seenUrl = '';
    let seenBody: unknown = null;
    mockFetch([
      async (req) => {
        seenUrl = req.url;
        seenBody = await req.json();
        return jsonResponse(200, { data: { video_id: 'vid_iv' } });
      },
    ]);
    const res = await heygen.generateVideo({
      avatarId: 'img-7',
      audioAssetId: 'asset-7',
      mode: 'avatar_iv',
    });
    expect(res).toEqual({ videoJobId: 'vid_iv' });
    expect(seenUrl).toBe('https://api.heygen.com/v2/video/av4/generate');
    expect(seenBody).toMatchObject({ image_key: 'img-7', audio_asset_id: 'asset-7' });
  });
});

describe('heygen.getVideoStatus', () => {
  it('normalises completed with a video URL', async () => {
    mockFetch([
      jsonResponse(200, {
        data: { status: 'completed', video_url: 'https://cdn.heygen.com/out.mp4' },
      }),
    ]);
    const res = await heygen.getVideoStatus('vid-1');
    expect(res).toEqual({ status: 'completed', videoUrl: 'https://cdn.heygen.com/out.mp4' });
  });

  it('normalises failed', async () => {
    mockFetch([jsonResponse(200, { data: { status: 'failed', error: 'gpu busy' } })]);
    expect(await heygen.getVideoStatus('vid-2')).toEqual({ status: 'failed', error: 'gpu busy' });
  });

  it('treats queued as pending', async () => {
    mockFetch([jsonResponse(200, { data: { status: 'queued' } })]);
    expect(await heygen.getVideoStatus('vid-3')).toEqual({ status: 'pending' });
  });
});

describe('heygen.listStockAvatars', () => {
  it('normalises the /v2/avatars response', async () => {
    mockFetch([
      jsonResponse(200, {
        data: {
          avatars: [
            { avatar_id: 'a1', avatar_name: 'Alex' },
            { avatar_id: 'a2', name: 'Priya' },
          ],
        },
      }),
    ]);
    expect(await heygen.listStockAvatars()).toEqual([
      { avatarId: 'a1', name: 'Alex', tier: 'photo', kind: 'avatar' },
      { avatarId: 'a2', name: 'Priya', tier: 'photo', kind: 'avatar' },
    ]);
  });

  it('merges talking_photos (user-trained) ahead of stock avatars', async () => {
    mockFetch([
      jsonResponse(200, {
        data: {
          avatars: [{ avatar_id: 'a1', avatar_name: 'Stock One' }],
          talking_photos: [
            { talking_photo_id: 'tp1', talking_photo_name: 'My Face' },
            { talking_photo_id: 'tp2' },
          ],
        },
      }),
    ]);
    expect(await heygen.listStockAvatars()).toEqual([
      { avatarId: 'tp1', name: 'My Face (trained)', tier: 'photo', kind: 'talking_photo' },
      { avatarId: 'tp2', name: 'Talking photo (trained)', tier: 'photo', kind: 'talking_photo' },
      { avatarId: 'a1', name: 'Stock One', tier: 'photo', kind: 'avatar' },
    ]);
  });
});
