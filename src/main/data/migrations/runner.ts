import type Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

// Trivial forward-only migration runner. Files are named `NNNN_name.sql` and
// applied in lexical order inside a single transaction the first time they're
// encountered. `schema_migrations` stores the integer version prefix.

export function runMigrations(db: Database.Database, migrationsDir: string): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );

  const applied = new Set<number>(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => (row as { version: number }).version),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();

  for (const file of files) {
    const version = Number.parseInt(file.slice(0, 4), 10);
    if (applied.has(version)) continue;
    const sql = readFileSync(path.resolve(migrationsDir, file), 'utf-8');
    const runMigration = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        version,
        Math.floor(Date.now() / 1000),
      );
    });
    runMigration();
  }
}
