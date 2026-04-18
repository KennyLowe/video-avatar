import type Database from 'better-sqlite3';
import { RepositoryBase } from './base.js';
import type { CostEntry } from '@shared/schemas/costEntry.js';

export class CostsRepository extends RepositoryBase {
  constructor(db: Database.Database, projectsRoot: string, slug: string) {
    super(db, projectsRoot, slug);
  }

  record(input: {
    jobId: number | null;
    provider: CostEntry['provider'];
    operation: CostEntry['operation'];
    units: number;
    unitKind: CostEntry['unitKind'];
    usdEstimate: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO costs (job_id, provider, operation, units, unit_kind, usd_estimate, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.jobId,
        input.provider,
        input.operation,
        input.units,
        input.unitKind,
        input.usdEstimate,
        Math.floor(Date.now() / 1000),
      );
  }

  mtd(): { provider: CostEntry['provider']; totalUsd: number }[] {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const cutoff = Math.floor(startOfMonth.getTime() / 1000);
    const rows = this.db
      .prepare(
        `SELECT provider, SUM(usd_estimate) AS totalUsd
         FROM costs WHERE recorded_at >= ? GROUP BY provider`,
      )
      .all(cutoff) as Array<{ provider: CostEntry['provider']; totalUsd: number }>;
    return rows;
  }

  listAll(): CostEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, job_id AS jobId, provider, operation, units,
                unit_kind AS unitKind, usd_estimate AS usdEstimate,
                recorded_at AS recordedAt
         FROM costs ORDER BY recorded_at DESC`,
      )
      .all() as CostEntry[];
    return rows;
  }
}
