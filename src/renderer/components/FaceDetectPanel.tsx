import type { HeuristicFinding } from '@renderer/services/qualityHeuristics.js';

// Inline list of quality-heuristic findings. Colour-coded by severity.
// FR-027 rejections block the Train button in the Avatar screen; warnings
// are informational.

interface Props {
  findings: readonly HeuristicFinding[];
  loading?: boolean;
}

export function FaceDetectPanel({ findings, loading }: Props): JSX.Element | null {
  if (loading) {
    return (
      <div className="lumo-heuristics lumo-muted" role="status">
        Running quality checks…
      </div>
    );
  }
  if (findings.length === 0) return null;
  return (
    <ul className="lumo-heuristics" role="list">
      {findings.map((f, i) => (
        <li key={`${f.ruleId}-${i}`} className={`lumo-heuristic lumo-heuristic--${f.severity}`}>
          <strong>{f.severity === 'reject' ? 'Blocks upload' : 'Warning'}</strong>
          <span>{f.message}</span>
        </li>
      ))}
    </ul>
  );
}
