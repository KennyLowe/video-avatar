import type Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'node:fs';
import { RepositoryBase } from './base.js';
import type { Take, TakeSourceSchema, TakeMarkSchema } from '@shared/schemas/take.js';
import type { z } from 'zod';

// Takes table. Stores paths relative to the project root; resolvePath on read
// enforces the absolute-path invariant.

type Source = z.infer<typeof TakeSourceSchema>;
type Mark = z.infer<typeof TakeMarkSchema>;

interface RawRow {
  id: number;
  path: string;
  source: Source;
  duration_seconds: number;
  trim_start_ms: number;
  trim_end_ms: number;
  mark: Mark;
  created_at: number;
}

export class TakesRepository extends RepositoryBase {
  constructor(db: Database.Database, projectsRoot: string, slug: string) {
    super(db, projectsRoot, slug);
  }

  create(input: { path: string; source: Source; durationSeconds: number }): Take {
    const now = Math.floor(Date.now() / 1000);
    const relPath = this.relativize(input.path);
    const info = this.db
      .prepare(
        `INSERT INTO takes (path, source, duration_seconds, trim_start_ms, trim_end_ms, mark, created_at)
         VALUES (?, ?, ?, 0, 0, 'unmarked', ?)`,
      )
      .run(relPath, input.source, input.durationSeconds, now);
    const row = this.get(Number(info.lastInsertRowid));
    if (row === null) throw new Error('Failed to read back inserted take');
    return row;
  }

  list(): Take[] {
    const rows = this.db
      .prepare(
        `SELECT id, path, source, duration_seconds, trim_start_ms, trim_end_ms, mark, created_at
         FROM takes ORDER BY created_at DESC`,
      )
      .all() as RawRow[];
    return rows.map((r) => this.fromRow(r));
  }

  listGood(): Take[] {
    const rows = this.db
      .prepare(
        `SELECT id, path, source, duration_seconds, trim_start_ms, trim_end_ms, mark, created_at
         FROM takes WHERE mark = 'good' ORDER BY created_at ASC`,
      )
      .all() as RawRow[];
    return rows.map((r) => this.fromRow(r));
  }

  get(id: number): Take | null {
    const row = this.db
      .prepare(
        `SELECT id, path, source, duration_seconds, trim_start_ms, trim_end_ms, mark, created_at
         FROM takes WHERE id = ?`,
      )
      .get(id) as RawRow | undefined;
    return row ? this.fromRow(row) : null;
  }

  mark(id: number, mark: Mark): Take {
    this.db.prepare('UPDATE takes SET mark = ? WHERE id = ?').run(mark, id);
    const next = this.get(id);
    if (next === null) throw new Error(`Take ${id} vanished during mark()`);
    return next;
  }

  trim(id: number, inMs: number, outMs: number): Take {
    if (inMs < 0 || outMs < 0 || outMs < inMs) {
      throw new Error('invalid trim: outMs must be >= inMs and both non-negative');
    }
    this.db
      .prepare('UPDATE takes SET trim_start_ms = ?, trim_end_ms = ? WHERE id = ?')
      .run(inMs, outMs, id);
    const next = this.get(id);
    if (next === null) throw new Error(`Take ${id} vanished during trim()`);
    return next;
  }

  remove(id: number): void {
    const row = this.get(id);
    if (row === null) return;
    // Best-effort disk cleanup; row removal is the source of truth.
    try {
      if (existsSync(row.path)) unlinkSync(row.path);
    } catch {
      // Ignore — orphan-on-disk check on next launch can surface this.
    }
    this.db.prepare('DELETE FROM takes WHERE id = ?').run(id);
  }

  /** Sum of effective seconds across takes marked good, accounting for trims. */
  goodSecondsTotal(): number {
    const takes = this.listGood();
    let seconds = 0;
    for (const t of takes) {
      const full = t.durationSeconds;
      const startS = t.trimStartMs / 1000;
      const endS = t.trimEndMs > 0 ? t.trimEndMs / 1000 : full;
      seconds += Math.max(0, endS - startS);
    }
    return seconds;
  }

  private fromRow(r: RawRow): Take {
    return {
      id: r.id,
      path: this.resolvePath(r.path),
      source: r.source,
      durationSeconds: r.duration_seconds,
      trimStartMs: r.trim_start_ms,
      trimEndMs: r.trim_end_ms,
      mark: r.mark,
      createdAt: r.created_at,
    };
  }
}
