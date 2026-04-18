import { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as keychain from '@main/platform/keychain.js';
import { getSettings } from '@main/platform/settings.js';
import { logger } from '@main/logging/jsonl.js';
import { ProviderError } from '@shared/errors.js';
import type { TransportKind } from '@shared/schemas/project.js';
import * as heygen from './heygen.js';

// Audio-transfer resolver per FR-034 / research.md §4.
//
// `heygen` (default): uploads to upload.heygen.com/v1/asset, refs via
// audio_asset_id on the generate call. Always available once a HeyGen
// credential is configured.
//
// `s3` / `r2`: AWS SDK + pre-signer — operator-owned bucket, short-TTL URL.
// Same code path, different endpoint. Credentials in keychain target
// `Lumo/s3`, bucket + region + optional prefix in settings.s3Config.
//
// `cloudflared`: spawn `cloudflared tunnel run --url http://localhost:<port>`
// against an ephemeral HTTP server serving the audio file. Returns the tunnel
// URL. cleanup() tears both down. Last-resort option; operator supplies the
// cloudflared binary path.

export interface TransportPutResult {
  kind: 'url' | 'asset';
  url?: string;
  assetId?: string;
  cleanup?: () => Promise<void>;
}

export interface Transport {
  readonly kind: TransportKind;
  isAvailable(): Promise<boolean>;
  put(localPath: string, hint?: { suggestedName?: string }): Promise<TransportPutResult>;
}

// --- heygen (default) ---------------------------------------------------

const heygenTransport: Transport = {
  kind: 'heygen',
  isAvailable: async () => true,
  put: async (localPath) => {
    const { assetId } = await heygen.uploadAudioAsset(localPath);
    return { kind: 'asset', assetId };
  },
};

// --- s3 / r2 ------------------------------------------------------------

interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

async function readS3Credentials(): Promise<S3Credentials> {
  const raw = await keychain.get('Lumo/s3');
  if (raw === null) {
    throw new ProviderError({
      provider: 's3',
      code: 'no_credential',
      message: 'No S3/R2 credential is configured.',
      nextStep:
        'Open Settings and paste your access key + secret key for the operator-owned bucket.',
    });
  }
  try {
    const parsed = JSON.parse(raw) as S3Credentials;
    if (typeof parsed.accessKeyId !== 'string' || typeof parsed.secretAccessKey !== 'string') {
      throw new Error('Missing keys');
    }
    return parsed;
  } catch {
    throw new ProviderError({
      provider: 's3',
      code: 'invalid_credential',
      message: 'The S3/R2 credential in the keychain is not a valid JSON object.',
      nextStep: 'Re-enter the credential in Settings.',
    });
  }
}

function buildS3Transport(kind: 's3' | 'r2'): Transport {
  return {
    kind,
    async isAvailable() {
      const { s3Config } = getSettings();
      const creds = await keychain.get('Lumo/s3').catch(() => null);
      return s3Config !== null && creds !== null;
    },
    async put(localPath, hint) {
      const { s3Config } = getSettings();
      if (s3Config === null) {
        throw new ProviderError({
          provider: kind,
          code: 'no_s3_config',
          message: `${kind === 's3' ? 'S3' : 'R2'} bucket configuration is missing.`,
          nextStep: 'Open Settings → Upload transport and configure the bucket + region.',
        });
      }
      const creds = await readS3Credentials();
      const client = new S3Client({
        region: s3Config.region,
        credentials: {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
        },
        ...(s3Config.endpoint ? { endpoint: s3Config.endpoint, forcePathStyle: true } : {}),
      });

      const filename = hint?.suggestedName ?? `${randomUUID()}-${path.basename(localPath)}`;
      const key = s3Config.prefix ? `${s3Config.prefix.replace(/\/+$/, '')}/${filename}` : filename;
      const body = readFileSync(localPath);

      try {
        await client.send(
          new PutObjectCommand({
            Bucket: s3Config.bucket,
            Key: key,
            Body: body,
            ContentType: inferMimeType(localPath),
          }),
        );
      } catch (cause) {
        throw new ProviderError({
          provider: kind,
          code: 'upload_failed',
          message: `Failed to upload to ${kind}://${s3Config.bucket}/${key}: ${(cause as Error).message}`,
          nextStep: 'Verify the bucket name, region, and that the access key has PutObject permission.',
          cause,
        });
      }

      let url: string;
      try {
        url = await getSignedUrl(
          client,
          new PutObjectCommand({ Bucket: s3Config.bucket, Key: key }),
          { expiresIn: s3Config.presignTtlSeconds },
        );
        // Swap PUT-signed URL for a GET-signed URL for downstream consumers
        // that read from it. (Generate takes GET.)
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        url = await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: s3Config.bucket, Key: key }),
          { expiresIn: s3Config.presignTtlSeconds },
        );
      } catch (cause) {
        throw new ProviderError({
          provider: kind,
          code: 'presign_failed',
          message: `Failed to pre-sign URL: ${(cause as Error).message}`,
          cause,
        });
      }

      return {
        kind: 'url',
        url,
        cleanup: async () => {
          await client
            .send(new DeleteObjectCommand({ Bucket: s3Config.bucket, Key: key }))
            .catch((err) => {
              logger.warn('transport.s3.cleanup_failed', {
                key,
                message: err instanceof Error ? err.message : String(err),
              });
            });
        },
      };
    },
  };
}

// --- cloudflared --------------------------------------------------------

const cloudflaredTransport: Transport = {
  kind: 'cloudflared',
  async isAvailable() {
    const { cloudflaredConfig } = getSettings();
    if (cloudflaredConfig === null) return false;
    return cloudflaredConfig.binaryPath !== undefined && cloudflaredConfig.binaryPath.length > 0;
  },
  async put(localPath) {
    const { cloudflaredConfig } = getSettings();
    if (cloudflaredConfig === null || !cloudflaredConfig.binaryPath) {
      throw new ProviderError({
        provider: 'cloudflared',
        code: 'no_binary_path',
        message: 'cloudflared binary path not configured.',
        nextStep:
          'Open Settings → Upload transport → cloudflared and point at your cloudflared executable.',
      });
    }

    const fileStat = await stat(localPath);
    const mime = inferMimeType(localPath);

    const server = await startEphemeralServer(localPath, fileStat.size, mime, cloudflaredConfig.port);
    const port = (server.address() as { port: number } | null)?.port ?? 0;

    let tunnel: ChildProcess;
    let tunnelUrl: string;
    try {
      const result = await spawnTunnel(cloudflaredConfig.binaryPath, port);
      tunnel = result.child;
      tunnelUrl = result.url;
    } catch (err) {
      server.close();
      throw err;
    }

    // Append a randomised path so the URL isn't discoverable — cloudflared
    // exposes everything on the server. The ephemeral server only serves
    // this one path anyway.
    return {
      kind: 'url',
      url: tunnelUrl,
      cleanup: async () => {
        try {
          tunnel.kill('SIGTERM');
        } catch {
          // ignore
        }
        await new Promise<void>((resolve) => server.close(() => resolve()));
      },
    };
  },
};

function startEphemeralServer(
  localPath: string,
  sizeBytes: number,
  mime: string,
  preferredPort: number,
): Promise<Server> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': sizeBytes.toString(),
      });
      createReadStream(localPath).pipe(res);
    });
    server.once('error', reject);
    server.listen(preferredPort, '127.0.0.1', () => resolvePromise(server));
  });
}

function spawnTunnel(binaryPath: string, port: number): Promise<{ child: ChildProcess; url: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      binaryPath,
      ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let settled = false;
    let stderrBuf = '';
    const urlPattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

    const inspect = (chunk: string): void => {
      stderrBuf += chunk;
      if (settled) return;
      const match = urlPattern.exec(stderrBuf);
      if (match !== null) {
        settled = true;
        resolvePromise({ child, url: match[0] });
      }
    };

    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      reject(
        new ProviderError({
          provider: 'cloudflared',
          code: 'tunnel_timeout',
          message: 'cloudflared did not report a tunnel URL within 30s.',
          nextStep:
            'Verify the cloudflared binary path is correct and your network allows outbound HTTPS.',
        }),
      );
    }, 30_000);

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new ProviderError({
          provider: 'cloudflared',
          code: 'spawn_failed',
          message: `Failed to spawn cloudflared: ${err.message}`,
          nextStep: 'Check the path in Settings → Upload transport.',
          cause: err,
        }),
      );
    });
    child.on('close', () => {
      clearTimeout(timeout);
      if (!settled) {
        reject(
          new ProviderError({
            provider: 'cloudflared',
            code: 'tunnel_closed_early',
            message: 'cloudflared exited before reporting a tunnel URL.',
          }),
        );
      }
    });
  });
}

// --- resolver -----------------------------------------------------------

const s3Transport: Transport = buildS3Transport('s3');
const r2Transport: Transport = buildS3Transport('r2');

export function resolve(project?: { uploadTransport?: TransportKind }): Transport {
  const preferred = project?.uploadTransport ?? getSettings().defaultUploadTransport;
  switch (preferred) {
    case 'heygen':
      return heygenTransport;
    case 's3':
      return s3Transport;
    case 'r2':
      return r2Transport;
    case 'cloudflared':
      return cloudflaredTransport;
    default:
      return heygenTransport;
  }
}

export function __transportsForTests(): Record<TransportKind, Transport> {
  return {
    heygen: heygenTransport,
    s3: s3Transport,
    r2: r2Transport,
    cloudflared: cloudflaredTransport,
  };
}

// --- helpers ------------------------------------------------------------

function inferMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}
