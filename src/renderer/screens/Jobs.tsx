import { useMemo, useState } from 'react';
import type { Job } from '@shared/schemas/job.js';

// Full Jobs panel: active + history, with filter by kind and provider.
// Reached via Ctrl+J or the tray's "Open Jobs" button.

interface Props {
  active: readonly Job[];
  history: readonly Job[];
  onCancel: (jobId: number) => Promise<void>;
}

type Tab = 'active' | 'history';

export function Jobs({ active, history, onCancel }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('active');
  const [kindFilter, setKindFilter] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<string>('');

  const rows = useMemo(() => {
    const source = tab === 'active' ? active : history;
    return source.filter((j) => {
      if (kindFilter !== '' && j.kind !== kindFilter) return false;
      if (providerFilter !== '' && j.provider !== providerFilter) return false;
      return true;
    });
  }, [tab, active, history, kindFilter, providerFilter]);

  return (
    <main className="lumo-jobs-panel">
      <header>
        <h1>Jobs</h1>
      </header>
      <section className="lumo-row">
        <div className="lumo-tabs">
          <button
            type="button"
            className={tab === 'active' ? 'is-active' : ''}
            onClick={() => setTab('active')}
          >
            Active ({active.length})
          </button>
          <button
            type="button"
            className={tab === 'history' ? 'is-active' : ''}
            onClick={() => setTab('history')}
          >
            History ({history.length})
          </button>
        </div>
        <label>
          Kind
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="">All</option>
            <option value="voice_train">voice_train</option>
            <option value="avatar_train">avatar_train</option>
            <option value="avatar_video">avatar_video</option>
            <option value="render">render</option>
            <option value="tts">tts</option>
          </select>
        </label>
        <label>
          Provider
          <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
            <option value="">All</option>
            <option value="elevenlabs">elevenlabs</option>
            <option value="heygen">heygen</option>
            <option value="remotion">remotion</option>
          </select>
        </label>
      </section>

      {rows.length === 0 ? (
        <p className="lumo-muted">No jobs to show.</p>
      ) : (
        <table className="lumo-jobs-table">
          <thead>
            <tr>
              <th>id</th>
              <th>kind</th>
              <th>provider</th>
              <th>status</th>
              <th>started</th>
              <th>output / error</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id} className={`lumo-jobs-table__row lumo-jobs-table__row--${j.status}`}>
                <td>#{j.id}</td>
                <td>{j.kind}</td>
                <td>{j.provider}</td>
                <td>{j.status}</td>
                <td>{new Date(j.createdAt * 1000).toLocaleString()}</td>
                <td className="lumo-jobs-table__details">
                  {j.error !== null
                    ? j.error.slice(0, 160)
                    : j.outputPath !== null
                      ? j.outputPath
                      : '—'}
                </td>
                <td>
                  {j.status === 'queued' || j.status === 'running' ? (
                    <button type="button" onClick={() => void onCancel(j.id)}>
                      Cancel
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
