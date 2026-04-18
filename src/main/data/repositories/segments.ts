import type Database from 'better-sqlite3';
import { RepositoryBase } from './base.js';
import type { Segment } from '@shared/schemas/segment.js';

interface RawRow {
  id: number;
  source_path: string;
  extracted_path: string;
  in_ms: number;
  out_ms: number;
  created_at: number;
}

export class SegmentsRepository extends RepositoryBase {
  constructor(db: Database.Database, projectsRoot: string, slug: string) {
    super(db, projectsRoot, slug);
  }

  create(input: {
    sourcePath: string;
    extractedPath: string;
    inMs: number;
    outMs: number;
  }): Segment {
    const now = Math.floor(Date.now() / 1000);
    const info = this.db
      .prepare(
        `INSERT INTO segments (source_path, extracted_path, in_ms, out_ms, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        this.relativize(input.sourcePath),
        this.relativize(input.extractedPath),
        input.inMs,
        input.outMs,
        now,
      );
    const row = this.get(Number(info.lastInsertRowid));
    if (row === null) throw new Error('Failed to read back inserted segment');
    return row;
  }

  list(): Segment[] {
    const rows = this.db
      .prepare(
        `SELECT id, source_path, extracted_path, in_ms, out_ms, created_at
         FROM segments ORDER BY created_at ASC`,
      )
      .all() as RawRow[];
    return rows.map((r) => this.fromRow(r));
  }

  get(id: number): Segment | null {
    const row = this.db
      .prepare(
        `SELECT id, source_path, extracted_path, in_ms, out_ms, created_at
         FROM segments WHERE id = ?`,
      )
      .get(id) as RawRow | undefined;
    return row ? this.fromRow(row) : null;
  }

  private fromRow(r: RawRow): Segment {
    return {
      id: r.id,
      sourcePath: this.resolvePath(r.source_path),
      extractedPath: this.resolvePath(r.extracted_path),
      inMs: r.in_ms,
      outMs: r.out_ms,
      createdAt: r.created_at,
    };
  }
}
