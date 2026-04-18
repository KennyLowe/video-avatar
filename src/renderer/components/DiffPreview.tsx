// Simple line-level diff preview. Used by the assist menu to surface a
// proposed rewrite and require explicit acceptance before it replaces the
// selection (FR-013).

interface Props {
  original: string;
  replacement: string;
  onAccept: () => void;
  onReject: () => void;
}

type Line =
  | { kind: 'same'; text: string }
  | { kind: 'remove'; text: string }
  | { kind: 'add'; text: string };

export function DiffPreview({ original, replacement, onAccept, onReject }: Props): JSX.Element {
  const lines = diffLines(original, replacement);
  return (
    <div className="lumo-modal" role="dialog" aria-modal="true" aria-labelledby="diff-title">
      <div className="lumo-modal__panel lumo-modal__panel--wide">
        <h2 id="diff-title">Proposed rewrite</h2>
        <p className="lumo-muted">
          Compare the two sides. Accept replaces the selection; Reject keeps it as-is.
        </p>
        <pre className="lumo-diff" aria-label="Unified diff">
          {lines.map((line, i) => (
            <div key={i} className={`lumo-diff__${line.kind}`}>
              <span className="lumo-diff__sigil">
                {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}
              </span>
              {line.text || '\u00a0'}
            </div>
          ))}
        </pre>
        <div className="lumo-modal__actions">
          <button type="button" onClick={onReject}>
            Reject
          </button>
          <button type="button" onClick={onAccept} aria-keyshortcuts="Control+Enter">
            Accept <kbd>Ctrl+Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

function diffLines(a: string, b: string): Line[] {
  const aLines = a.split(/\r?\n/);
  const bLines = b.split(/\r?\n/);
  const out: Line[] = [];
  // Intentionally dumb: show every original line as remove, every replacement
  // line as add. For multi-paragraph selections a real LCS would be nicer,
  // but operator review is more about "does this read well" than tracking
  // micro-edits.
  for (const line of aLines) out.push({ kind: 'remove', text: line });
  for (const line of bLines) out.push({ kind: 'add', text: line });
  return out;
}
