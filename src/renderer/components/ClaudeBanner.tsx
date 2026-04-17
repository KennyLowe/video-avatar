import { useCallback, useEffect, useState } from 'react';
import { lumo, unwrap } from '@renderer/lib/lumo.js';
import type { ClaudeVerifyResult } from '@shared/schemas/claudeCode.js';

// Non-dismissible banner shown on Home while Claude Code is missing or
// unauthenticated (FR-001). Blocks forward work: the parent screen should
// refuse to render its primary content until this resolves to `authenticated`.

interface Props {
  onResolved?: (result: ClaudeVerifyResult) => void;
}

export function ClaudeBanner({ onResolved }: Props): JSX.Element | null {
  const [state, setState] = useState<ClaudeVerifyResult | null>(null);
  const [busy, setBusy] = useState(false);

  const runCheck = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      const status = await unwrap(lumo.credentials.status());
      setState(status.claudeCode);
      if (status.claudeCode.installed && status.claudeCode.authenticated) {
        onResolved?.(status.claudeCode);
      }
    } catch {
      setState({ installed: false, authenticated: false, reason: 'probe_error' });
    } finally {
      setBusy(false);
    }
  }, [onResolved]);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  if (state === null) return null;
  if (state.installed && state.authenticated) return null;

  const remediation = state.installed
    ? 'Run `claude /login` in your terminal and come back.'
    : 'Install with `winget install Anthropic.Claude`, then run `claude /login`.';

  return (
    <div className="lumo-banner lumo-banner--block" role="alert" aria-live="assertive">
      <strong>Claude Code is {state.installed ? 'not authenticated' : 'not installed'}.</strong>{' '}
      <span>{remediation}</span>{' '}
      <button type="button" onClick={() => void runCheck()} disabled={busy}>
        {busy ? 'Checking…' : 'Recheck'}
      </button>
    </div>
  );
}
