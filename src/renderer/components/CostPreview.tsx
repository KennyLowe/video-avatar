import type { CostPreview as CostPreviewShape } from '@shared/ipc-types.js';

interface Props {
  preview: CostPreviewShape | null;
  loading: boolean;
}

export function CostPreview({ preview, loading }: Props): JSX.Element {
  if (loading) {
    return <div className="lumo-cost-preview lumo-muted">Calculating cost…</div>;
  }
  if (preview === null) {
    return (
      <div className="lumo-cost-preview lumo-muted">
        Pick a voice, avatar, script, and mode to see the cost.
      </div>
    );
  }
  return (
    <div className="lumo-cost-preview" role="region" aria-label="Cost preview">
      <h3>Before you run</h3>
      <table className="lumo-cost-table">
        <tbody>
          <tr>
            <th scope="row">ElevenLabs speech</th>
            <td>
              {preview.elevenlabs.characters.toLocaleString()} chars ·{' '}
              {preview.elevenlabs.credits.toLocaleString()} credits
            </td>
            <td className="lumo-cost__usd">{formatUsd(preview.elevenlabs.usd)}</td>
          </tr>
          <tr>
            <th scope="row">HeyGen render</th>
            <td>
              {preview.heygen.seconds}s · {preview.heygen.credits.toLocaleString()} credits
            </td>
            <td className="lumo-cost__usd">{formatUsd(preview.heygen.usd)}</td>
          </tr>
          <tr className="lumo-cost__total">
            <th scope="row">Total estimate</th>
            <td />
            <td className="lumo-cost__usd">{formatUsd(preview.totalUsd)}</td>
          </tr>
        </tbody>
      </table>
      <div className="lumo-cost__mtd">
        <span>Month-to-date</span>
        <span>ElevenLabs {formatUsd(preview.mtdUsd.elevenlabs)}</span>
        <span>HeyGen {formatUsd(preview.mtdUsd.heygen)}</span>
      </div>
    </div>
  );
}

function formatUsd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}
