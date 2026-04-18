// System + user prompt construction for scripts.generate (FR-010).
// The Zod response schema lives in src/shared/schemas/script.ts so renderer
// and main share it.

export const SCRIPT_SYSTEM_PROMPT = `You are a script editor for spoken-word video delivery. You always respond with a single JSON object and nothing else — no markdown, no prose, no preamble.`;

export type ScriptTone = 'conversational' | 'technical' | 'formal';

// The JSON schema + rules live in the USER prompt, not the system prompt.
// Claude Code's --print + --output-format json tends to ignore the system
// prompt's formatting demands when the user prompt reads like a natural-
// language question; repeating the schema in the user prompt — and
// putting the task BELOW the contract — pins the response shape.
export function buildScriptPrompt(input: {
  prompt: string;
  tone: ScriptTone;
  targetDurationSeconds: number;
  wpm?: number;
}): string {
  const wpm = input.wpm ?? 150;
  const targetWords = Math.round((input.targetDurationSeconds / 60) * wpm);
  return [
    'Respond with ONE JSON object and nothing else. No prose before or after.',
    'No markdown code fences. The response must start with `{` and end with `}`.',
    '',
    'Schema:',
    '{',
    '  "title": string,',
    '  "body": string,',
    '  "estimatedDurationSeconds": integer,',
    '  "chapters": [{ "title": string, "startLine": integer }]  // optional',
    '}',
    '',
    'Rules for `body`:',
    '- Short sentences. Natural contractions. Second person where natural ("you\'ll see").',
    '- No bullet points, no numbered lists, no headings, no markdown syntax.',
    '- No parenthetical asides longer than a few words.',
    '- No bare URLs — describe the resource instead.',
    '- Expand every acronym on first use: "HTTP (hypertext transfer protocol)".',
    '- Optional inline pause hints like [pause] or <break time="400ms"/>.',
    '',
    'Rules for `estimatedDurationSeconds`:',
    '- Base it on 150 words per minute unless asked otherwise.',
    '',
    'Rules for `chapters` (only when the requested length is ≥ 2 minutes):',
    '- 2–6 chapters max. Titles 3–6 words. `startLine` is 1-indexed in `body`.',
    '',
    '----',
    `Tone: ${input.tone}.`,
    `Target length: approximately ${input.targetDurationSeconds} seconds (~${targetWords} words at ${wpm} WPM).`,
    '',
    'Operator prompt:',
    input.prompt,
    '',
    'Now output the JSON object.',
  ].join('\n');
}
