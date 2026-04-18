import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import * as claudeCode from '@main/providers/claudeCode.js';
import { getSettings } from '@main/platform/settings.js';
import { ProviderError } from '@shared/errors.js';

// Prompt-to-props flow per FR-039 / FR-040.
// One generation attempt + one retry (with the validation error fed back
// into the prompt). Second failure throws — the UI opens a JSON editor
// pre-populated with the last response so the operator can fix it by hand.

const REMOTION_PROPS_SYSTEM_PROMPT = `You are a configurator for a video composition template. Return ONLY a single JSON object matching the provided schema. No prose, no markdown fences, no explanation.

Rules:
- Output must parse as JSON and satisfy every schema constraint.
- Use the provided starting values as a base; only change fields the operator's prompt asks to change.
- For colour fields, use 7-character hex (e.g. "#1b73e8") unless the schema says otherwise.
- Do not invent fields that aren't in the schema — extra keys will be rejected.
`;

export interface TemplatePropsAttemptFailure {
  kind: 'validation_failed';
  validationError: string;
  lastRawResponse: string;
}

export interface TemplatePropsSuccess<T> {
  kind: 'ok';
  props: T;
}

export type TemplatePropsResult<T> = TemplatePropsSuccess<T> | TemplatePropsAttemptFailure;

export async function generateTemplateProps<T>(input: {
  schema: z.ZodType<T>;
  startingProps: T;
  userPrompt: string;
  templateId: string;
  signal?: AbortSignal;
}): Promise<TemplatePropsResult<T>> {
  const jsonSchema = zodToJsonSchema(input.schema, input.templateId);
  const basePrompt = [
    `Operator prompt: ${input.userPrompt}`,
    '',
    'Return JSON matching this schema:',
    JSON.stringify(jsonSchema, null, 2),
    '',
    'Starting values:',
    JSON.stringify(input.startingProps, null, 2),
  ].join('\n');

  let prompt = basePrompt;
  let lastRaw = '';
  let lastValidationError = '';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await claudeCode.invoke<unknown>({
      model: getSettings().defaultClaudeModel,
      systemPrompt: REMOTION_PROPS_SYSTEM_PROMPT,
      prompt,
      outputFormat: 'json',
      ...(input.signal ? { signal: input.signal } : {}),
    });
    lastRaw = response.raw;
    const parsed = input.schema.safeParse(response.parsed);
    if (parsed.success) {
      return { kind: 'ok', props: parsed.data };
    }
    lastValidationError = parsed.error.message;
    if (attempt === 1) {
      prompt = [
        basePrompt,
        '',
        'Your previous response failed schema validation with this error:',
        lastValidationError,
        '',
        'Return a corrected JSON object. Do not re-introduce the same violation.',
      ].join('\n');
    }
  }

  return {
    kind: 'validation_failed',
    validationError: lastValidationError,
    lastRawResponse: lastRaw,
  };
}

/** Direct schema-parse — used by the JSON editor fallback when the
 *  operator edits the response by hand. */
export function validateProps<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { kind: 'ok'; props: T } | { kind: 'error'; message: string } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { kind: 'ok', props: parsed.data };
  return { kind: 'error', message: parsed.error.message };
}

export { ProviderError };
