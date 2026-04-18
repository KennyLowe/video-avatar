import { useState } from 'react';
import { lumo, unwrap } from '@renderer/lib/lumo.js';
import { AsyncFeedback } from './AsyncFeedback.js';
import type { Job } from '@shared/schemas/job.js';

// Persistent bottom-of-window strip per FR-043. Always visible; collapses
// to count + most-recent status, expands to a scrollable active list.
// History lives on the Jobs panel (Ctrl+J).

interface Props {
  active: readonly Job[];
  onCancel: (jobId: number) => Promise<void>;
  onOpenPanel: () => void;
}

export function JobsTray({ active, onCancel, onOpenPanel }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  // FR-043 asks for completed jobs to linger for 60 s before moving to
  // history. Phase-7 scope cut: the useJobs hook promotes terminal jobs
  // straight into history. The tray only shows the actively-running set,
  // which is enough to satisfy the core "always-visible status" contract.
  const latest = active[active.length - 1] ?? null;

  return (
    <aside className={`lumo-jobs-tray ${expanded ? 'lumo-jobs-tray--expanded' : ''}`}>
      <header className="lumo-jobs-tray__header">
        <button type="button" onClick={() => setExpanded((x) => !x)}>
          {active.length > 0
            ? `${active.length} active job${active.length === 1 ? '' : 's'}`
            : 'No active jobs'}
          {latest !== null && !expanded ? ` — latest: ${describeStatus(latest)}` : ''}
        </button>
        <button type="button" onClick={onOpenPanel} aria-keyshortcuts="Control+J">
          Open Jobs <kbd>Ctrl+J</kbd>
        </button>
      </header>
      {expanded && active.length > 0 ? (
        <ul className="lumo-jobs-tray__list">
          {active.map((job) => (
            <li key={job.id} className={`lumo-jobs-tray__job lumo-jobs-tray__job--${job.status}`}>
              <span className="lumo-jobs-tray__kind">{describeKind(job)}</span>
              <AsyncFeedback kind="typical" hint={describeStatus(job)} />
              <button type="button" onClick={() => void onCancel(job.id)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void unwrap(lumo.jobs.showLog());
                }}
              >
                Log
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}

function describeKind(job: Job): string {
  switch (job.kind) {
    case 'voice_train':
      return 'Voice training';
    case 'avatar_train':
      return 'Avatar training';
    case 'avatar_video':
      return 'Avatar video';
    case 'render':
      return 'Composition render';
    case 'tts':
      return 'Text-to-speech';
  }
}

function describeStatus(job: Job): string {
  if (job.status === 'done') return 'Done';
  if (job.status === 'failed') return `Failed: ${job.error?.slice(0, 80) ?? 'see log'}`;
  if (job.status === 'canceled') return 'Cancelled';
  return `${job.status}${job.attempt > 0 ? ` — attempt ${job.attempt}` : ''}`;
}
