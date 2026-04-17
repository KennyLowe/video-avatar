import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { projectDbPath, projectDir } from '@main/platform/paths.js';
import { runMigrations } from './migrations/runner.js';

// Per-project SQLite connection pool. The cache is keyed by absolute DB path,
// not by project id, so tests can open throwaway projects at arbitrary roots.

const cache = new Map<string, Database.Database>();

export interface OpenDbParams {
  projectsRoot: string;
  slug: string;
}

export function openProjectDb(params: OpenDbParams): Database.Database {
  const abs = projectDbPath(params.projectsRoot, params.slug);
  const existing = cache.get(abs);
  if (existing) return existing;
  mkdirSync(projectDir(params.projectsRoot, params.slug), { recursive: true });
  const db = new Database(abs);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db, path.resolve(__dirname, 'migrations'));
  cache.set(abs, db);
  return db;
}

export function closeProjectDb(params: OpenDbParams): void {
  const abs = projectDbPath(params.projectsRoot, params.slug);
  const db = cache.get(abs);
  if (!db) return;
  db.close();
  cache.delete(abs);
}

export function closeAllProjectDbs(): void {
  for (const db of cache.values()) db.close();
  cache.clear();
}

/**
 * Run `work` inside an IMMEDIATE transaction. Throws if `work` returns a
 * promise — all mutations are sync via better-sqlite3.
 */
export function tx<T>(db: Database.Database, work: (db: Database.Database) => T): T {
  const runner = db.transaction(work);
  return runner(db);
}
