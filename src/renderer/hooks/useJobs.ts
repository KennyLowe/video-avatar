import { useCallback, useEffect, useState } from 'react';
import { lumo, unwrap } from '@renderer/lib/lumo.js';
import type { Job } from '@shared/schemas/job.js';

// useJobs — active + recent jobs for a given project, kept live via the
// jobs.onUpdate push channel. The tray consumes this directly; the Jobs
// panel layers history on top.

const HISTORY_LIMIT = 50;

export interface UseJobsResult {
  active: readonly Job[];
  history: readonly Job[];
  refresh: () => Promise<void>;
  cancel: (jobId: number) => Promise<void>;
}

export function useJobs(projectSlug: string | null): UseJobsResult {
  const [active, setActive] = useState<Job[]>([]);
  const [history, setHistory] = useState<Job[]>([]);

  const refresh = useCallback(async (): Promise<void> => {
    if (projectSlug === null) {
      setActive([]);
      setHistory([]);
      return;
    }
    const [a, h] = await Promise.all([
      unwrap(lumo.jobs.listActive({ slug: projectSlug })).catch(() => []),
      unwrap(lumo.jobs.listHistory({ slug: projectSlug, limit: HISTORY_LIMIT })).catch(() => []),
    ]);
    setActive(a);
    setHistory(h);
  }, [projectSlug]);

  const cancel = useCallback(
    async (jobId: number): Promise<void> => {
      if (projectSlug === null) return;
      await unwrap(lumo.jobs.cancel({ slug: projectSlug, jobId }));
      await refresh();
    },
    [projectSlug, refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (projectSlug === null) return undefined;
    const unsubscribe = lumo.jobs.onUpdate((update) => {
      if (update.slug !== projectSlug) return;
      setActive((prev) => mergeActive(prev, update.job));
      setHistory((prev) => mergeHistory(prev, update.job));
    });
    return unsubscribe;
  }, [projectSlug]);

  return { active, history, refresh, cancel };
}

function mergeActive(prev: readonly Job[], incoming: Job): Job[] {
  const existing = prev.filter((j) => j.id !== incoming.id);
  if (incoming.status === 'queued' || incoming.status === 'running') {
    return [...existing, incoming].sort((a, b) => a.createdAt - b.createdAt);
  }
  // Incoming is terminal — drop from active.
  return existing;
}

function mergeHistory(prev: readonly Job[], incoming: Job): Job[] {
  if (
    incoming.status !== 'done' &&
    incoming.status !== 'failed' &&
    incoming.status !== 'canceled'
  ) {
    return [...prev];
  }
  const without = prev.filter((j) => j.id !== incoming.id);
  return [incoming, ...without].slice(0, HISTORY_LIMIT);
}
