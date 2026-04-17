import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type DatabaseType from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runMigrations } from '@main/data/migrations/runner.js';

// Verifies the migration runner against the real 0001_init.sql. Uses an
// in-memory SQLite DB with the runner pointed at the migrations directory.
//
// `better-sqlite3` ships a native binding that the postinstall step rebuilds
// against Electron's Node ABI (per the app's runtime target). That binding
// is not loadable under plain Node, which is what vitest runs under, so the
// migrations test is gated on the binding being importable and otherwise
// skipped. Phase 8 adds a Playwright-Electron harness that runs the same
// assertions inside the real runtime (tracked via T146 / migration parity).

let Database: typeof DatabaseType | null = null;
let electronBindingLoadable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Database = require('better-sqlite3') as typeof DatabaseType;
  // Construction is where the native binding actually fires. The Electron
  // ABI-build doesn't load under plain Node even though the JS shim imports
  // fine, so probe with a throwaway :memory: DB.
  const probe = new Database(':memory:');
  probe.close();
  electronBindingLoadable = true;
} catch {
  electronBindingLoadable = false;
}

describe.skipIf(!electronBindingLoadable)('migrations runner + 0001_init', () => {
  let tmpDir: string;
  let db: DatabaseType.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-migrations-'));
    // We already short-circuit this block when Database is null.
    db = new Database!(':memory:');
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the full table set from 0001_init.sql', () => {
    const migrationsDir = path.resolve(__dirname, '../../src/main/data/migrations');
    runMigrations(db, migrationsDir);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual(
      expect.arrayContaining([
        'avatars',
        'costs',
        'jobs',
        'renders',
        'schema_migrations',
        'script_chapters',
        'scripts',
        'segments',
        'takes',
        'voices',
      ]),
    );
  });

  it('is idempotent — a second run inserts no new rows', () => {
    const migrationsDir = path.resolve(__dirname, '../../src/main/data/migrations');
    runMigrations(db, migrationsDir);
    runMigrations(db, migrationsDir);

    const applied = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as {
      n: number;
    };
    expect(applied.n).toBe(1);
  });

  it('enforces jobs.status CHECK constraint', () => {
    const migrationsDir = path.resolve(__dirname, '../../src/main/data/migrations');
    runMigrations(db, migrationsDir);
    expect(() =>
      db
        .prepare(
          "INSERT INTO jobs (provider, kind, status, created_at) VALUES ('elevenlabs','tts','invalid',0)",
        )
        .run(),
    ).toThrow(/CHECK constraint/i);
  });
});
