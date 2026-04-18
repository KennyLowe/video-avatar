import { useState } from 'react';
import { lumo, unwrap } from '@renderer/lib/lumo.js';
import { DiffPreview } from './DiffPreview.js';
import { AsyncFeedback } from './AsyncFeedback.js';
import type { AssistAction } from '@shared/ipc-types.js';

const ASSIST_ACTIONS: readonly { id: AssistAction; label: string; description: string }[] = [
  { id: 'tighten', label: 'Tighten', description: 'Shorten without losing meaning' },
  { id: 'less-corporate', label: 'Less corporate', description: 'Rewrite as plain human speech' },
  {
    id: 'break-into-chapters',
    label: 'Break into chapters',
    description: 'Add inline chapter headings',
  },
  { id: 'add-hook', label: 'Add a hook', description: 'Prefix with a one-line opener' },
  { id: 'convert-jargon', label: 'Convert jargon', description: 'Plain-English substitutes' },
];

interface Props {
  /** Current editor selection. Empty string disables all actions. */
  selection: string;
  /** Called with the replacement text when the operator accepts. */
  onAccept: (replacement: string) => void;
}

export function AssistMenu({ selection, onAccept }: Props): JSX.Element {
  const [busyAction, setBusyAction] = useState<AssistAction | null>(null);
  const [preview, setPreview] = useState<{ replacement: string } | null>(null);
  const disabled = selection.trim().length === 0;

  async function run(action: AssistAction): Promise<void> {
    setBusyAction(action);
    try {
      const res = await unwrap(lumo.scripts.assist({ action, selection }));
      setPreview(res);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="lumo-assist">
      <h3>Claude-assist on selection</h3>
      {disabled ? (
        <p className="lumo-muted">Select some text in the script editor to enable these.</p>
      ) : null}
      <ul className="lumo-assist__list">
        {ASSIST_ACTIONS.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => void run(a.id)}
              disabled={disabled || busyAction !== null}
              title={a.description}
            >
              {busyAction === a.id ? `${a.label}…` : a.label}
            </button>
          </li>
        ))}
      </ul>
      {busyAction !== null ? (
        <AsyncFeedback kind="typical" hint={`Running ${busyAction}… typically 1–5 s.`} />
      ) : null}
      {preview !== null ? (
        <DiffPreview
          original={selection}
          replacement={preview.replacement}
          onAccept={() => {
            onAccept(preview.replacement);
            setPreview(null);
          }}
          onReject={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}
