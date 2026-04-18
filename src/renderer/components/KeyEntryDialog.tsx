import { useState } from 'react';
import { lumo, unwrap } from '@renderer/lib/lumo.js';

// Masked credential-entry dialog per FR-002 / FR-004. The Test action hits
// the provider before the key is persisted; credentials.test returns
// `{ plan, mtdCredits }` on success, the stored key remains; on failure it
// rolls back and throws the provider's verbatim error.

interface Props {
  provider: 'elevenlabs' | 'heygen';
  onSaved: () => void;
  onCancel: () => void;
}

const PROVIDER_LABELS: Record<Props['provider'], string> = {
  elevenlabs: 'ElevenLabs',
  heygen: 'HeyGen',
};

export function KeyEntryDialog({ provider, onSaved, onCancel }: Props): JSX.Element {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleTest(): Promise<void> {
    if (key.trim().length === 0) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await unwrap(lumo.credentials.test({ provider, key: key.trim() }));
      setSuccess(
        `Verified. Plan: ${res.plan}${res.mtdCredits !== null ? ` — ${res.mtdCredits} credits remaining` : ''}.`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(): Promise<void> {
    setBusy(true);
    try {
      await unwrap(lumo.credentials.set({ provider, key: key.trim() }));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lumo-modal" role="dialog" aria-modal="true" aria-labelledby="key-entry-title">
      <div className="lumo-modal__panel">
        <h2 id="key-entry-title">Paste your {PROVIDER_LABELS[provider]} API key</h2>
        <p className="lumo-muted">
          Stored only in the operating system&#39;s credential manager. Lumo never writes
          credentials to disk.
        </p>
        <input
          type="password"
          autoFocus
          className="lumo-input"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-label={`${PROVIDER_LABELS[provider]} API key`}
          disabled={busy}
        />
        {error !== null ? <div className="lumo-banner lumo-banner--block">{error}</div> : null}
        {success !== null ? <div className="lumo-banner lumo-banner--ok">{success}</div> : null}
        <div className="lumo-modal__actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={busy || key.trim().length === 0}
          >
            Test
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy || success === null}
            aria-keyshortcuts="Control+Enter"
          >
            Save <kbd>Ctrl+Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
