// Secret-shape redactor. Every string that crosses into the log file or into
// an error surfaced to the UI passes through this first. Constitutional
// references: Principle #3 ("Secrets never touch disk in plaintext"), FR-003,
// FR-052, SC-006. Covered by redactor.test.ts + the Phase-8 fuzz suite.
//
// Heuristics are intentionally over-eager — a false positive ("[REDACTED]"
// showing up in a log where no secret actually existed) is cheap; a false
// negative (a real key ending up on disk) is a defect.

// Each rule is a regex with an optional `keepPrefix` that preserves a few
// leading chars so humans can correlate log lines without exposing the secret.
interface Rule {
  readonly name: string;
  readonly pattern: RegExp;
  readonly replacement: string;
}

const REDACTED = '[REDACTED]';

// Most patterns deliberately use a lookbehind so a credential stays boundaried
// from surrounding content. Keep the list short — add a new rule only when
// we actually carry a new secret shape.
const RULES: readonly Rule[] = [
  // ElevenLabs user keys are 32-char hex with an "xi-api-key" header name.
  // Handles both `xi-api-key: <value>` (header form) and
  // `"xi-api-key":"<value>"` (JSON form).
  {
    name: 'elevenlabs-header',
    pattern: /(xi-api-key"?\s*[:=]\s*"?)[A-Za-z0-9_-]{20,}("?)/gi,
    replacement: `$1${REDACTED}$2`,
  },
  // HeyGen API keys travel in X-Api-Key.
  {
    name: 'heygen-header',
    pattern: /(x-api-key"?\s*[:=]\s*"?)[A-Za-z0-9_-]{20,}("?)/gi,
    replacement: `$1${REDACTED}$2`,
  },
  // Any bearer / authorization token.
  {
    name: 'authorization-bearer',
    pattern: /(authorization\s*[:=]\s*bearer\s+)[A-Za-z0-9._-]{16,}/gi,
    replacement: `$1${REDACTED}`,
  },
  // AWS pre-signed URL signature params.
  {
    name: 'aws-signature',
    pattern: /(X-Amz-Signature=)[A-Fa-f0-9]{32,}/g,
    replacement: `$1${REDACTED}`,
  },
  {
    name: 'aws-credential',
    pattern: /(X-Amz-Credential=)[^&\s"']+/g,
    replacement: `$1${REDACTED}`,
  },
  // Anthropic API keys (should never be in our process, but belt-and-braces).
  {
    name: 'anthropic-key',
    pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g,
    replacement: REDACTED,
  },
  // Generic OpenAI-style sk- keys — also never in our process, same reasoning.
  {
    name: 'sk-generic',
    pattern: /\bsk-(?:live|test|proj)?[A-Za-z0-9_-]{20,}/g,
    replacement: REDACTED,
  },
  // Cloudflare tunnel hostnames — expose operator infrastructure identity.
  {
    name: 'cloudflared-host',
    pattern: /[a-z0-9-]+\.trycloudflare\.com/gi,
    replacement: REDACTED,
  },
  // GitHub-style gho_/ghp_/ghs_ tokens (helpful for CLAUDE.md examples, not
  // for Lumo logs, but cheap to keep).
  {
    name: 'github-token',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/g,
    replacement: REDACTED,
  },
];

export function redact(input: string): string {
  if (!input || input.length === 0) return input;
  let out = input;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, rule.replacement);
  }
  return out;
}

export function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redact(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      // Keys named like credentials get their entire value redacted regardless
      // of shape — cheaper than relying solely on pattern matching.
      if (/(api[_-]?key|password|secret|authorization|token)/i.test(key)) {
        out[key] = REDACTED;
      } else {
        out[key] = redactValue(source[key]);
      }
    }
    return out;
  }
  return value;
}

/** Testing hook: list the active rule names. */
export function __rules(): readonly string[] {
  return RULES.map((r) => r.name);
}
