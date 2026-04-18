import { useEffect, useState } from 'react';
import { lumo, unwrap } from '@renderer/lib/lumo.js';
import type { ClaudeVerifyResult } from '@shared/schemas/claudeCode.js';

// Side-by-side local ledger vs provider-reported usage per FR-050.
// `projectSlug` is optional — when null, only the provider-reported side
// is populated (no project to query a ledger from).

interface Props {
  projectSlug: string | null;
}

interface ProviderRow {
  name: 'ElevenLabs' | 'HeyGen';
  authenticated: boolean;
  plan: string | null;
  providerMtdCredits: number | null;
  localMtdUsd: number | null;
}

interface ClaudeRow {
  installed: boolean;
  authenticated: boolean;
  reason: string | null;
  version: string | null;
}

export function ProviderStatus({ projectSlug }: Props): JSX.Element {
  const [rows, setRows] = useState<ProviderRow[] | null>(null);
  const [claude, setClaude] = useState<ClaudeRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [credStatus, mtd] = await Promise.all([
          unwrap(lumo.credentials.status()),
          projectSlug !== null
            ? unwrap(lumo.costs.mtd({ slug: projectSlug })).catch(() => null)
            : Promise.resolve(null),
        ]);
        setClaude(credStatusToClaudeRow(credStatus.claudeCode));
        const local = mtd?.local ?? { elevenlabs: 0, heygen: 0, total: 0 };
        const provider = mtd?.providerReported ?? { elevenlabs: null, heygen: null };
        setRows([
          {
            name: 'ElevenLabs',
            authenticated: credStatus.elevenlabs,
            plan: provider.elevenlabs?.plan ?? null,
            providerMtdCredits: provider.elevenlabs?.mtdCredits ?? null,
            localMtdUsd: local.elevenlabs ?? null,
          },
          {
            name: 'HeyGen',
            authenticated: credStatus.heygen,
            plan: provider.heygen?.plan ?? null,
            providerMtdCredits: provider.heygen?.mtdCredits ?? null,
            localMtdUsd: local.heygen ?? null,
          },
        ]);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [projectSlug]);

  if (error !== null) {
    return <div className="lumo-banner lumo-banner--block">{error}</div>;
  }

  return (
    <div className="lumo-provider-status">
      <h3>Service status</h3>
      {claude !== null ? (
        <div className="lumo-provider-status__claude">
          <strong>Claude Code</strong>
          <span className="lumo-muted">
            {claude.installed ? 'installed' : 'missing'} ·{' '}
            {claude.authenticated ? 'authenticated' : 'unauthenticated'}
            {claude.version !== null ? ` · ${claude.version}` : ''}
            {claude.reason !== null ? ` (${claude.reason})` : ''}
          </span>
        </div>
      ) : null}
      {rows !== null ? (
        <table className="lumo-provider-status__table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Auth</th>
              <th>Plan</th>
              <th>Provider MTD</th>
              <th>Local ledger MTD</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>{r.authenticated ? '✓' : '—'}</td>
                <td>{r.plan ?? '—'}</td>
                <td>
                  {r.providerMtdCredits !== null
                    ? `${r.providerMtdCredits.toLocaleString()} credits`
                    : '—'}
                </td>
                <td>{r.localMtdUsd !== null ? formatUsd(r.localMtdUsd) : '—'}</td>
                <td>
                  <a
                    href={
                      r.name === 'ElevenLabs'
                        ? 'https://elevenlabs.io/app'
                        : 'https://app.heygen.com'
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    dashboard ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

function credStatusToClaudeRow(verify: ClaudeVerifyResult): ClaudeRow {
  return {
    installed: verify.installed,
    authenticated: verify.authenticated,
    reason: verify.reason ?? null,
    version: verify.version ?? null,
  };
}

function formatUsd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}
