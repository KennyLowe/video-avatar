import { useState } from 'react';

// Two-step delete confirmation per FR-009. Operator must type the project's
// exact name before the Delete button activates. The IPC handler re-verifies
// name match before actually trashing the folder.

interface Props {
  projectName: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function DeleteProjectDialog({ projectName, onConfirm, onCancel }: Props): JSX.Element {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed === projectName;

  async function handleConfirm(): Promise<void> {
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lumo-modal" role="dialog" aria-modal="true" aria-labelledby="delete-project">
      <div className="lumo-modal__panel">
        <h2 id="delete-project">Delete project?</h2>
        <p>
          The folder for <strong>{projectName}</strong> will be moved to the Recycle Bin. You can
          recover it from there if you change your mind.
        </p>
        <label>
          Type the project name to confirm:
          <input
            className="lumo-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            placeholder={projectName}
          />
        </label>
        {error !== null ? <div className="lumo-banner lumo-banner--block">{error}</div> : null}
        <div className="lumo-modal__actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" onClick={() => void handleConfirm()} disabled={!matches || busy}>
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
