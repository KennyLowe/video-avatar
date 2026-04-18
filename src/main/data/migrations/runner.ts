import type Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

// Trivial forward-only migration runner. Two entry points:
//   * `runMigrations(db, dir)` — reads .sql files from `dir` at runtime.
//     Used by the migration integration test which walks the real source
//     tree.
//   * `runMigrationsInline(db, migrations)` — accepts a pre-loaded list
//     of { version, sql }. Used by the main process at runtime where the
//     .sql files are inlined into the bundle via Vite's `?raw` import so
//     they don't need to be shipped as a sibling directory.
//
// Files are named `NNNN_name.sql` and applied in version-ascending order
// inside a single transaction the first time they're encountered.
// `schema_migrations` stores the integer version prefix.

export interface InlineMigration {
  readonly version: number;
  readonly sql: string;
}

function ensureMigrationsTable(db: Database.Database): Set<number> {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );
  return new Set<number>(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => (row as { version: number }).version),
  );
}

function applyOne(db: Database.Database, version: number, sql: string): void {
  const run = db.transaction(() => {
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      version,
      Math.floor(Date.now() / 1000),
    );
  });
  run();
}

export function runMigrations(db: Database.Database, migrationsDir: string): void {
  const applied = ensureMigrationsTable(db);
  const files = readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const version = Number.parseInt(file.slice(0, 4), 10);
    if (applied.has(version)) continue;
    const sql = readFileSync(path.resolve(migrationsDir, file), 'utf-8');
    applyOne(db, version, sql);
  }
}

export function runMigrationsInline(
  db: Database.Database,
  migrations: readonly InlineMigration[],
): void {
  const applied = ensureMigrationsTable(db);
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  for (const m of sorted) {
    if (applied.has(m.version)) continue;
    applyOne(db, m.version, m.sql);
  }
}
