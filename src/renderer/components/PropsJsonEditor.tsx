import { useState } from 'react';
import Editor from '@monaco-editor/react';

// Structured-editor fallback per FR-040. Opens when the prompt-to-props
// flow exhausts its single retry. The operator edits the JSON directly;
// we validate on submit via compose.validateProps.

interface Props {
  initialValue: unknown;
  errorMessage: string | null;
  onApply: (props: unknown) => void;
  onCancel: () => void;
  onValidate: (
    candidate: unknown,
  ) => Promise<{ kind: 'ok'; props: unknown } | { kind: 'error'; message: string }>;
}

export function PropsJsonEditor({
  initialValue,
  errorMessage,
  onApply,
  onCancel,
  onValidate,
}: Props): JSX.Element {
  const [text, setText] = useState(() => JSON.stringify(initialValue, null, 2));
  const [localError, setLocalError] = useState<string | null>(errorMessage);
  const [validating, setValidating] = useState(false);

  async function handleApply(): Promise<void> {
    setValidating(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        setLocalError(`JSON parse error: ${(err as Error).message}`);
        return;
      }
      const result = await onValidate(parsed);
      if (result.kind === 'error') {
        setLocalError(result.message);
        return;
      }
      onApply(result.props);
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="lumo-modal" role="dialog" aria-modal="true" aria-labelledby="props-editor">
      <div className="lumo-modal__panel lumo-modal__panel--wide">
        <h2 id="props-editor">Edit template properties</h2>
        <p className="lumo-muted">
          Claude Code couldn&#39;t produce valid JSON for this template. Fix it by hand — the editor
          will validate against the template&#39;s schema when you Apply.
        </p>
        <Editor
          height="420px"
          defaultLanguage="json"
          theme="vs-dark"
          value={text}
          onChange={(v) => setText(v ?? '')}
          options={{
            wordWrap: 'on',
            minimap: { enabled: false },
            fontSize: 13,
          }}
        />
        {localError !== null ? (
          <pre className="lumo-banner lumo-banner--block lumo-error-pre">{localError}</pre>
        ) : null}
        <div className="lumo-modal__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={validating}
            aria-keyshortcuts="Control+Enter"
          >
            {validating ? 'Validating…' : 'Apply'} <kbd>Ctrl+Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
