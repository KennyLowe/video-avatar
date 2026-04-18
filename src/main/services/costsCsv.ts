import type { CostEntry } from '@shared/schemas/costEntry.js';

// Pure CSV-shape helper for the cost ledger export (FR-050). Kept separate
// from ipc/costs.ts so contract/integration tests can assert the exact
// header + row format without spinning up an IPC handler.

const HEADERS = [
  'timestamp',
  'provider',
  'operation',
  'units',
  'unit_kind',
  'usd_estimate',
  'project_id',
  'job_id',
] as const;

export function costsToCsv(rows: readonly CostEntry[], projectSlug: string): string {
  const lines = [HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      [
        new Date(row.recordedAt * 1000).toISOString(),
        row.provider,
        row.operation,
        String(row.units),
        row.unitKind,
        row.usdEstimate.toFixed(4),
        projectSlug,
        row.jobId === null ? '' : String(row.jobId),
      ].join(','),
    );
  }
  return lines.join('\n');
}

export const COSTS_CSV_HEADERS: readonly string[] = HEADERS;
