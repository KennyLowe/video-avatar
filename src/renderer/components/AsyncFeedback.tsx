import type { ReactElement } from 'react';

// Structural contract enforcing SC-002. Any async operation expected to exceed
// 5 seconds MUST render exactly one of these three forms. A Phase-8 CI grep
// check fails the build if a renderer file awaits a long-running IPC channel
// without rendering <AsyncFeedback>.

export type AsyncFeedbackProps =
  | {
      kind: 'progress';
      /** 0..1 */
      value: number;
      label?: string;
    }
  | {
      kind: 'eta';
      etaSeconds: number;
      label?: string;
    }
  | {
      kind: 'typical';
      /** Human-readable hint, e.g. "typically 2–4 hours" */
      hint: string;
      label?: string;
    };

export function AsyncFeedback(props: AsyncFeedbackProps): ReactElement {
  if (props.kind === 'progress') {
    const pct = Math.max(0, Math.min(1, props.value)) * 100;
    return (
      <div className="lumo-async lumo-async--progress" role="status" aria-live="polite">
        {props.label ? <span className="lumo-async__label">{props.label}</span> : null}
        <progress className="lumo-async__bar" max={100} value={pct} />
        <span className="lumo-async__meter">{pct.toFixed(0)}%</span>
      </div>
    );
  }
  if (props.kind === 'eta') {
    return (
      <div className="lumo-async lumo-async--eta" role="status" aria-live="polite">
        {props.label ? <span className="lumo-async__label">{props.label}</span> : null}
        <span className="lumo-async__meter">{formatEta(props.etaSeconds)}</span>
      </div>
    );
  }
  return (
    <div className="lumo-async lumo-async--typical" role="status" aria-live="polite">
      {props.label ? <span className="lumo-async__label">{props.label}</span> : null}
      <span className="lumo-async__meter">{props.hint}</span>
    </div>
  );
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `~${Math.round(seconds)}s remaining`;
  if (seconds < 3_600) return `~${Math.round(seconds / 60)}m remaining`;
  return `~${Math.round(seconds / 3_600)}h remaining`;
}
