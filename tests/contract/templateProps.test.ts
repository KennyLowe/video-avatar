import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Drive the prompt-to-props flow via a mocked claudeCode.invoke. The first
// attempt returns junk to trigger validation failure; the retry returns
// valid JSON; the caller gets {kind:'ok'} without the JSON editor opening.
// A second test asserts that two bad attempts produce {kind:'validation_failed'}.

vi.mock('@main/providers/claudeCode.js', () => ({
  invoke: vi.fn(),
}));

vi.mock('@main/platform/settings.js', () => ({
  getSettings: () => ({ defaultClaudeModel: 'claude-opus-4-7' }),
}));

const { invoke } = await import('@main/providers/claudeCode.js');
const { generateTemplateProps, validateProps } = await import('@main/services/templateProps.js');

const schema = z.object({
  title: z.string().min(1),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
type Props = z.infer<typeof schema>;

const defaultProps: Props = { title: 'Hi', brandColor: '#1b73e8' };

beforeEach(() => {
  (invoke as unknown as ReturnType<typeof vi.fn>).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateTemplateProps', () => {
  it('returns {kind: ok} when the first attempt parses cleanly', async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      raw: '{"title":"Hello","brandColor":"#ff00ff"}',
      parsed: { title: 'Hello', brandColor: '#ff00ff' },
      durationMs: 100,
      stderr: '',
    });
    const result = await generateTemplateProps<Props>({
      schema,
      startingProps: defaultProps,
      userPrompt: 'make it magenta',
      templateId: 'Test',
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.props).toEqual({ title: 'Hello', brandColor: '#ff00ff' });
    }
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('retries once on validation failure then returns the corrected props', async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        raw: '{"title":"","brandColor":"not-a-hex"}',
        parsed: { title: '', brandColor: 'not-a-hex' },
        durationMs: 100,
        stderr: '',
      })
      .mockResolvedValueOnce({
        raw: '{"title":"Ok","brandColor":"#123456"}',
        parsed: { title: 'Ok', brandColor: '#123456' },
        durationMs: 100,
        stderr: '',
      });
    const result = await generateTemplateProps<Props>({
      schema,
      startingProps: defaultProps,
      userPrompt: 'p',
      templateId: 'Test',
    });
    expect(result.kind).toBe('ok');
    expect(invoke).toHaveBeenCalledTimes(2);
    // The retry's prompt MUST include the validation error from attempt #1.
    const secondCallArgs = (invoke as unknown as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as
      | { prompt?: string }
      | undefined;
    expect(secondCallArgs?.prompt).toMatch(/previous response failed schema validation/i);
  });

  it('returns {kind: validation_failed} after two bad attempts', async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        raw: '{"title":"","brandColor":"bad"}',
        parsed: { title: '', brandColor: 'bad' },
        durationMs: 100,
        stderr: '',
      })
      .mockResolvedValueOnce({
        raw: '{"title":"","brandColor":"still bad"}',
        parsed: { title: '', brandColor: 'still bad' },
        durationMs: 100,
        stderr: '',
      });
    const result = await generateTemplateProps<Props>({
      schema,
      startingProps: defaultProps,
      userPrompt: 'p',
      templateId: 'Test',
    });
    expect(result.kind).toBe('validation_failed');
    if (result.kind === 'validation_failed') {
      expect(result.validationError.length).toBeGreaterThan(0);
      expect(result.lastRawResponse).toContain('still bad');
    }
  });
});

describe('validateProps', () => {
  it('accepts valid input and returns the parsed value', () => {
    const result = validateProps(schema, { title: 'A', brandColor: '#abcabc' });
    expect(result.kind).toBe('ok');
  });

  it('returns a human message on failure', () => {
    const result = validateProps(schema, { title: 'A', brandColor: 'not hex' });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.message.length).toBeGreaterThan(0);
  });
});
