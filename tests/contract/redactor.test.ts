import { describe, expect, it } from 'vitest';
import { redact, redactValue, __rules } from '@main/services/redactor.js';

// Per-rule coverage for the log redactor. Each rule gets its own `it` so a
// regression is immediately localised to the failing pattern.

describe('redactor', () => {
  it('has a known rule set', () => {
    expect(__rules()).toEqual([
      'elevenlabs-header',
      'heygen-header',
      'authorization-bearer',
      'aws-signature',
      'aws-credential',
      'anthropic-key',
      'sk-generic',
      'cloudflared-host',
      'github-token',
    ]);
  });

  it('redacts xi-api-key header values in either header or JSON form', () => {
    expect(redact('xi-api-key: abcdef1234567890abcdef1234567890')).toBe('xi-api-key: [REDACTED]');
    expect(redact('"xi-api-key":"abcdef1234567890abcdef1234567890"')).toBe(
      '"xi-api-key":"[REDACTED]"',
    );
  });

  it('redacts x-api-key headers', () => {
    expect(redact('X-Api-Key: sk-heygen_0123456789ABCDEFGHIJKLMNOPQRSTUV')).toBe(
      'X-Api-Key: [REDACTED]',
    );
  });

  it('redacts Authorization: Bearer tokens', () => {
    expect(redact('authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIi.abcdef')).toBe(
      'authorization: Bearer [REDACTED]',
    );
  });

  it('redacts AWS pre-signed URL signature parameters', () => {
    const url =
      'https://bucket.s3.amazonaws.com/key?X-Amz-Credential=AKIA01234567890ABCDE/20260417/us-east-1/s3/aws4_request&X-Amz-Signature=deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef';
    const cleaned = redact(url);
    expect(cleaned).not.toContain('deadbeefcafebabe');
    expect(cleaned).not.toContain('AKIA01234567890ABCDE');
    expect(cleaned).toContain('X-Amz-Signature=[REDACTED]');
    expect(cleaned).toContain('X-Amz-Credential=[REDACTED]');
  });

  it('redacts Anthropic keys everywhere', () => {
    expect(redact('key=sk-ant-abcdef0123456789ABCDEFGHIJKL')).toBe('key=[REDACTED]');
  });

  it('redacts generic sk- keys', () => {
    expect(redact('use sk-liveABCDEFGHIJKLMNOPQRSTUV1234')).toBe('use [REDACTED]');
    expect(redact('try sk-test_0123456789abcdef0123456789')).toBe('try [REDACTED]');
  });

  it('redacts cloudflared tunnel hostnames', () => {
    expect(redact('visit https://happy-unicorn-42.trycloudflare.com/audio.mp3 please')).toBe(
      'visit https://[REDACTED]/audio.mp3 please',
    );
  });

  it('redacts GitHub personal tokens', () => {
    expect(redact('gh_token=gho_0123456789abcdefghijABCDEFGHIJ0123456789')).toBe(
      'gh_token=[REDACTED]',
    );
  });

  it('leaves strings with no secrets untouched', () => {
    const ordinary = 'the operator clicked Run at 12:03 and the pipeline started';
    expect(redact(ordinary)).toBe(ordinary);
  });

  it('recurses into objects and arrays via redactValue', () => {
    const out = redactValue({
      request: {
        url: 'https://upload.heygen.com/v1/asset',
        headers: { 'X-Api-Key': 'abcdef1234567890abcdef1234567890', 'Content-Type': 'audio/mpeg' },
      },
      nested: [{ api_key: 'should-be-redacted-by-key-name' }],
    });
    expect(JSON.stringify(out)).not.toContain('abcdef1234567890abcdef1234567890');
    expect(JSON.stringify(out)).not.toContain('should-be-redacted-by-key-name');
    // Non-sensitive fields pass through.
    expect((out as { request: { url: string } }).request.url).toBe(
      'https://upload.heygen.com/v1/asset',
    );
  });

  it('redacts keys by name regardless of their value shape', () => {
    const out = redactValue({ password: 'anything', secret: 42, authorization: ['x', 'y'] });
    expect(out).toEqual({
      password: '[REDACTED]',
      secret: '[REDACTED]',
      authorization: '[REDACTED]',
    });
  });

  it('is a no-op on primitives', () => {
    expect(redactValue(null)).toBe(null);
    expect(redactValue(undefined)).toBe(undefined);
    expect(redactValue(42)).toBe(42);
    expect(redactValue(true)).toBe(true);
  });
});
