import { describe, expect, it } from 'vitest';
import { redact } from '@main/services/redactor.js';

// Fuzz the redactor with 10 000 strings shaped like our known secret forms.
// A "shape" is a template that slots randomly-generated credential material
// into a surrounding context (headers, JSON, query strings) so the regex
// lookbehinds are exercised the same way they are in real log lines.
//
// The invariant: after redact(), the generated credential material must NOT
// appear anywhere in the output. The test fails if even one of the 10 000
// samples leaks. Constitutional reference: Principle #3 + FR-052 + SC-006.

// Deterministic Mulberry32 PRNG so fuzz failures reproduce from the seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

interface Shape {
  readonly name: string;
  /** Build a (credential, context) pair for a single fuzz draw. */
  render: (rnd: () => number) => { credential: string; context: string };
}

const ALPHANUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ALPHANUM_DASH = `${ALPHANUM}_-`;
const HEX = '0123456789abcdef';
const HEX_UPPER = '0123456789ABCDEF';

function pick(rnd: () => number, alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet.charAt(Math.floor(rnd() * alphabet.length));
  }
  return out;
}

function randInt(rnd: () => number, min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}

const SHAPES: readonly Shape[] = [
  {
    name: 'xi-api-key header',
    render: (rnd) => {
      const credential = pick(rnd, ALPHANUM_DASH, randInt(rnd, 24, 48));
      return { credential, context: `xi-api-key: ${credential}` };
    },
  },
  {
    name: 'xi-api-key JSON',
    render: (rnd) => {
      const credential = pick(rnd, ALPHANUM_DASH, randInt(rnd, 24, 48));
      return { credential, context: `{"xi-api-key":"${credential}","other":"ok"}` };
    },
  },
  {
    name: 'x-api-key header',
    render: (rnd) => {
      const credential = pick(rnd, ALPHANUM_DASH, randInt(rnd, 24, 48));
      return { credential, context: `X-Api-Key: ${credential}` };
    },
  },
  {
    name: 'authorization bearer',
    render: (rnd) => {
      const credential = pick(rnd, `${ALPHANUM}._-`, randInt(rnd, 20, 64));
      return { credential, context: `authorization: Bearer ${credential}` };
    },
  },
  {
    name: 'aws signature',
    render: (rnd) => {
      const credential = pick(rnd, HEX, randInt(rnd, 40, 96));
      return {
        credential,
        context: `https://bucket.s3.amazonaws.com/k?X-Amz-Signature=${credential}&foo=bar`,
      };
    },
  },
  {
    name: 'aws signature uppercase',
    render: (rnd) => {
      const credential = pick(rnd, HEX_UPPER, randInt(rnd, 40, 96));
      return {
        credential,
        context: `host/k?X-Amz-Signature=${credential}&next=1`,
      };
    },
  },
  {
    name: 'aws credential',
    render: (rnd) => {
      const credential = `AKIA${pick(rnd, ALPHANUM, 16)}/20260417/us-east-1/s3/aws4_request`;
      return {
        credential,
        context: `?X-Amz-Credential=${credential}&X-Amz-Date=20260417T120000Z`,
      };
    },
  },
  {
    name: 'anthropic key',
    render: (rnd) => {
      const credential = `sk-ant-${pick(rnd, ALPHANUM_DASH, randInt(rnd, 24, 64))}`;
      return { credential, context: `using ${credential} right now` };
    },
  },
  {
    name: 'sk-live',
    render: (rnd) => {
      const credential = `sk-live${pick(rnd, ALPHANUM, randInt(rnd, 24, 64))}`;
      return { credential, context: `export OPENAI_API_KEY=${credential}` };
    },
  },
  {
    name: 'sk-test',
    render: (rnd) => {
      const credential = `sk-test_${pick(rnd, ALPHANUM, randInt(rnd, 24, 64))}`;
      return { credential, context: `key="${credential}"` };
    },
  },
  {
    name: 'sk-proj',
    render: (rnd) => {
      const credential = `sk-proj${pick(rnd, ALPHANUM_DASH, randInt(rnd, 24, 64))}`;
      return { credential, context: `token=${credential}` };
    },
  },
  {
    name: 'cloudflared host',
    render: (rnd) => {
      const host = `${pick(rnd, 'abcdefghijklmnopqrstuvwxyz0123456789-', randInt(rnd, 8, 32))}.trycloudflare.com`;
      return { credential: host, context: `visit https://${host}/audio.mp3 please` };
    },
  },
  {
    name: 'github token',
    render: (rnd) => {
      const prefix = 'pousr'.charAt(Math.floor(rnd() * 5));
      const credential = `gh${prefix}_${pick(rnd, ALPHANUM, randInt(rnd, 36, 64))}`;
      return { credential, context: `GH_TOKEN=${credential}` };
    },
  },
];

describe('redactor fuzz', () => {
  it('redacts 10 000 randomised secret-shaped strings with zero escape', () => {
    const rnd = mulberry32(0x1abe11ed);
    const iterations = 10_000;
    const leaks: Array<{ shape: string; credential: string; context: string; output: string }> = [];

    for (let i = 0; i < iterations; i += 1) {
      const shape = SHAPES[Math.floor(rnd() * SHAPES.length)]!;
      const { credential, context } = shape.render(rnd);
      const output = redact(context);
      if (output.includes(credential)) {
        leaks.push({ shape: shape.name, credential, context, output });
        if (leaks.length >= 5) break;
      }
    }

    if (leaks.length > 0) {
      const summary = leaks
        .map(
          (leak, idx) =>
            `#${idx + 1} [${leak.shape}]\n  credential: ${leak.credential}\n  input:  ${leak.context}\n  output: ${leak.output}`,
        )
        .join('\n---\n');
      expect.fail(`Redactor leaked ${leaks.length} credentials:\n${summary}`);
    }
  });
});
