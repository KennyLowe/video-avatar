import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('keytar', () => ({
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
}));

// Fake platform/settings so the transport resolver can read a stable
// configuration without hitting %APPDATA%.
vi.mock('@main/platform/settings.js', () => {
  let state: {
    s3Config: {
      endpoint?: string;
      region: string;
      bucket: string;
      prefix?: string;
      presignTtlSeconds: number;
    } | null;
    cloudflaredConfig: { binaryPath?: string; port: number } | null;
    defaultUploadTransport: 'heygen' | 's3' | 'r2' | 'cloudflared';
  } = {
    s3Config: null,
    cloudflaredConfig: null,
    defaultUploadTransport: 'heygen',
  };
  return {
    getSettings: () => state,
    __setTestSettings: (next: Partial<typeof state>) => {
      state = { ...state, ...next };
    },
  };
});

// Mock heygen.uploadAudioAsset so the 'heygen' transport test doesn't hit
// the real API surface.
vi.mock('@main/providers/heygen.js', () => ({
  uploadAudioAsset: vi.fn(async () => ({ assetId: 'asset_test_123' })),
}));

import * as keytar from 'keytar';
import { __transportsForTests, resolve } from '@main/providers/transport.js';
import * as settingsModule from '@main/platform/settings.js';
import * as heygen from '@main/providers/heygen.js';

// Reach into the vi.mock factory's __setTestSettings escape hatch. The
// factory above exposes it at runtime; the compile-time module type doesn't
// know about it, so cast at the boundary.
const __setTestSettings = (settingsModule as unknown as {
  __setTestSettings: (next: Record<string, unknown>) => void;
}).__setTestSettings;

const getPasswordMock = keytar.getPassword as unknown as ReturnType<typeof vi.fn>;

let tmpDir: string;
let audioPath: string;

beforeEach(() => {
  getPasswordMock.mockReset();
  tmpDir = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-transport-'));
  audioPath = path.resolve(tmpDir, 'say.mp3');
  writeFileSync(audioPath, Buffer.from([0x49, 0x44, 0x33, 0x00, 0x00]));
  __setTestSettings({
    s3Config: null,
    cloudflaredConfig: null,
    defaultUploadTransport: 'heygen',
  });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('transport.resolve', () => {
  it("returns 'heygen' by default", () => {
    expect(resolve().kind).toBe('heygen');
  });

  it('honours per-project override', () => {
    expect(resolve({ uploadTransport: 's3' }).kind).toBe('s3');
    expect(resolve({ uploadTransport: 'r2' }).kind).toBe('r2');
    expect(resolve({ uploadTransport: 'cloudflared' }).kind).toBe('cloudflared');
  });

  it("falls back to 'heygen' for unknown kinds", () => {
    // @ts-expect-error — deliberate invalid kind
    expect(resolve({ uploadTransport: 'ftp' }).kind).toBe('heygen');
  });
});

describe('heygen transport', () => {
  it('delegates to heygen.uploadAudioAsset and returns an assetId', async () => {
    const t = __transportsForTests().heygen;
    const result = await t.put(audioPath);
    expect(result.kind).toBe('asset');
    expect(result.assetId).toBe('asset_test_123');
    expect(heygen.uploadAudioAsset).toHaveBeenCalledWith(audioPath);
  });
});

describe('s3 / r2 transport availability', () => {
  it('reports not available without a configured bucket', async () => {
    getPasswordMock.mockResolvedValue('{"accessKeyId":"A","secretAccessKey":"B"}');
    const t = __transportsForTests().s3;
    expect(await t.isAvailable()).toBe(false);
  });

  it('reports not available without keychain credentials', async () => {
    __setTestSettings({
      s3Config: {
        region: 'us-east-1',
        bucket: 'test-bucket',
        presignTtlSeconds: 900,
      },
    });
    getPasswordMock.mockResolvedValue(null);
    const t = __transportsForTests().s3;
    expect(await t.isAvailable()).toBe(false);
  });

  it('throws no_s3_config when put() is called without config', async () => {
    getPasswordMock.mockResolvedValue('{"accessKeyId":"A","secretAccessKey":"B"}');
    const t = __transportsForTests().s3;
    await expect(t.put(audioPath)).rejects.toMatchObject({
      provider: 's3',
      code: 'no_s3_config',
    });
  });

  it('throws no_credential when keychain is empty', async () => {
    __setTestSettings({
      s3Config: { region: 'us-east-1', bucket: 'b', presignTtlSeconds: 900 },
    });
    getPasswordMock.mockResolvedValue(null);
    const t = __transportsForTests().s3;
    await expect(t.put(audioPath)).rejects.toMatchObject({
      provider: 's3',
      code: 'no_credential',
    });
  });

  it('throws invalid_credential when keychain value is garbage', async () => {
    __setTestSettings({
      s3Config: { region: 'us-east-1', bucket: 'b', presignTtlSeconds: 900 },
    });
    getPasswordMock.mockResolvedValue('not json');
    const t = __transportsForTests().s3;
    await expect(t.put(audioPath)).rejects.toMatchObject({
      provider: 's3',
      code: 'invalid_credential',
    });
  });
});

describe('cloudflared transport availability', () => {
  it('reports not available without a configured binary path', async () => {
    const t = __transportsForTests().cloudflared;
    expect(await t.isAvailable()).toBe(false);
  });

  it('reports available when binary path is set', async () => {
    __setTestSettings({
      cloudflaredConfig: { binaryPath: 'C:/tools/cloudflared.exe', port: 0 },
    });
    const t = __transportsForTests().cloudflared;
    expect(await t.isAvailable()).toBe(true);
  });

  it('throws no_binary_path when put() is called without config', async () => {
    const t = __transportsForTests().cloudflared;
    await expect(t.put(audioPath)).rejects.toMatchObject({
      provider: 'cloudflared',
      code: 'no_binary_path',
    });
  });
});
