import type Database from 'better-sqlite3';
import { RepositoryBase } from './base.js';
import type { Job } from '@shared/schemas/job.js';

// jobs table repository. Used by the worker and the ipc/jobs surface.

export class JobsRepository extends RepositoryBase {
  constructor(db: Database.Database, projectsRoot: string, slug: string) {
    super(db, projectsRoot, slug);
  }

  create(input: {
    provider: Job['provider'];
    kind: Job['kind'];
    inputRef: string | null;
    notifyOnComplete?: boolean;
  }): Job {
    const now = Math.floor(Date.now() / 1000);
    const info = this.db
      .prepare(
        `INSERT INTO jobs (provider, kind, status, input_ref, attempt, notify_on_complete, created_at)
         VALUES (?, ?, 'queued', ?, 0, ?, ?)`,
      )
      .run(
        input.provider,
        input.kind,
        input.inputRef,
        input.notifyOnComplete === false ? 0 : 1,
        now,
      );
    const created = this.get(Number(info.lastInsertRowid));
    if (created === null) throw new Error('Failed to create job row');
    return created;
  }

  get(id: number): Job | null {
    const row = this.db
      .prepare(
        `SELECT id, provider, provider_job_id AS providerJobId, kind,
                input_ref AS inputRef, output_path AS outputPath, status,
                last_polled_at AS lastPolledAt, next_poll_at AS nextPollAt,
                attempt, error, notify_on_complete AS notifyOnComplete,
                created_at AS createdAt
         FROM jobs WHERE id = ?`,
      )
      .get(id) as (Omit<Job, 'notifyOnComplete'> & { notifyOnComplete: number }) | undefined;
    if (!row) return null;
    return { ...row, notifyOnComplete: row.notifyOnComplete === 1 };
  }

  listActive(): Job[] {
    const rows = this.db
      .prepare(
        `SELECT id, provider, provider_job_id AS providerJobId, kind,
                input_ref AS inputRef, output_path AS outputPath, status,
                last_polled_at AS lastPolledAt, next_poll_at AS nextPollAt,
                attempt, error, notify_on_complete AS notifyOnComplete,
                created_at AS createdAt
         FROM jobs WHERE status IN ('queued', 'running') ORDER BY created_at ASC`,
      )
      .all() as Array<Omit<Job, 'notifyOnComplete'> & { notifyOnComplete: number }>;
    return rows.map((r) => ({ ...r, notifyOnComplete: r.notifyOnComplete === 1 }));
  }

  updateStatus(id: number, patch: Partial<Job>): void {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    if (patch.status !== undefined) {
      setClauses.push('status = ?');
      values.push(patch.status);
    }
    if (patch.providerJobId !== undefined) {
      setClauses.push('provider_job_id = ?');
      values.push(patch.providerJobId);
    }
    if (patch.outputPath !== undefined) {
      setClauses.push('output_path = ?');
      values.push(patch.outputPath);
    }
    if (patch.lastPolledAt !== undefined) {
      setClauses.push('last_polled_at = ?');
      values.push(patch.lastPolledAt);
    }
    if (patch.nextPollAt !== undefined) {
      setClauses.push('next_poll_at = ?');
      values.push(patch.nextPollAt);
    }
    if (patch.attempt !== undefined) {
      setClauses.push('attempt = ?');
      values.push(patch.attempt);
    }
    if (patch.error !== undefined) {
      setClauses.push('error = ?');
      values.push(patch.error);
    }
    if (setClauses.length === 0) return;
    values.push(id);
    this.db
      .prepare(`UPDATE jobs SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...(values as unknown[]));
  }
}
