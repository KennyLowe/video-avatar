// One system prompt per script-assist action (FR-013). Each runs a single
// Claude Code invocation, receives the operator's current selection, and
// returns a string that replaces the selection (the UI requires explicit
// accept before the replacement lands).

export type AssistAction =
  | 'tighten'
  | 'less-corporate'
  | 'break-into-chapters'
  | 'add-hook'
  | 'convert-jargon';

export interface AssistBuildResult {
  systemPrompt: string;
  userPrompt: string;
}

const COMMON_RULES = `Return ONLY the replacement text, with no wrapping explanation, no markdown fences, no quotes.
Preserve the speaker's voice. Keep spoken-register rules: short sentences, natural contractions, no bullets, no markdown syntax, no bare URLs.`;

const ACTIONS: Record<AssistAction, string> = {
  tighten: `You are a script editor. Tighten the following passage without changing its meaning. Remove hedges, filler, and redundant phrasing. Keep it under 80% of the original length where possible.
${COMMON_RULES}`,

  'less-corporate': `You are a script editor. Rewrite the following passage so it sounds less corporate — like a knowledgeable human talking to another human, not a press release. Cut jargon, passive voice, and empty superlatives.
${COMMON_RULES}`,

  'break-into-chapters': `You are a script editor. Break the following passage into 2–5 clearly-themed chapters. Each chapter starts with a short inline heading on its own line using plain text (not markdown). Keep the existing prose intact inside each chapter — only add the headings and regroup paragraphs as needed.
${COMMON_RULES}`,

  'add-hook': `You are a script editor. Add a single one-line hook at the very top of the following passage. The hook should be under 15 words, make a concrete claim or pose a sharp question, and flow naturally into the first sentence that was already there.
${COMMON_RULES}`,

  'convert-jargon': `You are a script editor. The following passage contains domain jargon that a general audience would not understand. Rewrite it so every jargon term is replaced by a plain-English equivalent, OR expanded on first use (e.g. "API (the interface another program talks to)"). Do not dumb down the meaning.
${COMMON_RULES}`,
};

export function buildAssistPrompts(action: AssistAction, selection: string): AssistBuildResult {
  const systemPrompt = ACTIONS[action];
  const userPrompt = `Passage to rewrite:\n\n${selection}`;
  return { systemPrompt, userPrompt };
}

export const ASSIST_ACTIONS: readonly { id: AssistAction; label: string; description: string }[] = [
  { id: 'tighten', label: 'Tighten', description: 'Shorten without losing meaning' },
  { id: 'less-corporate', label: 'Less corporate', description: 'Rewrite as plain human speech' },
  {
    id: 'break-into-chapters',
    label: 'Break into chapters',
    description: 'Add 2–5 inline chapter headings',
  },
  { id: 'add-hook', label: 'Add a hook', description: 'Prefix with a one-line opener' },
  {
    id: 'convert-jargon',
    label: 'Convert jargon',
    description: 'Plain-English substitutes or expansions',
  },
];
