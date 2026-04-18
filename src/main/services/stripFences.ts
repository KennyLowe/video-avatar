// Strip a surrounding markdown code fence from a model response. Claude
// sometimes wraps output in ```markdown\n...\n``` despite a system prompt
// that asks for raw text — this is the single place we undo that so the
// diff preview (and any downstream consumer) sees clean content.

const FENCE_PATTERN = /^\s*```(?:[a-z0-9_+-]*)?\r?\n([\s\S]*?)\r?\n```\s*$/i;

export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const match = FENCE_PATTERN.exec(trimmed);
  if (match === null) return trimmed;
  const inner = match[1];
  return inner === undefined ? trimmed : inner.trim();
}
