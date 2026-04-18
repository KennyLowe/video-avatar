import type Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { RepositoryBase } from './base.js';
import type { Script } from '@shared/schemas/script.js';

// Per-project scripts table + file-on-disk versioning (FR-014). Every save
// writes a new row AND a new file; rows are never mutated after insert.

export class ScriptsRepository extends RepositoryBase {
  constructor(db: Database.Database, projectsRoot: string, slug: string) {
    super(db, projectsRoot, slug);
  }

  list(): Script[] {
    const rows = this.db
      .prepare(
        `SELECT id, slug, version, title, body_md AS bodyMd, word_count AS wordCount,
                estimated_seconds AS estimatedSeconds, parent_version_id AS parentVersionId,
                created_at AS createdAt, updated_at AS updatedAt
         FROM scripts ORDER BY slug ASC, version DESC`,
      )
      .all() as Script[];
    return rows;
  }

  get(id: number): Script | null {
    const row = this.db
      .prepare(
        `SELECT id, slug, version, title, body_md AS bodyMd, word_count AS wordCount,
                estimated_seconds AS estimatedSeconds, parent_version_id AS parentVersionId,
                created_at AS createdAt, updated_at AS updatedAt
         FROM scripts WHERE id = ?`,
      )
      .get(id) as Script | undefined;
    return row ?? null;
  }

  save(input: {
    slug: string;
    title: string;
    bodyMd: string;
    estimatedSeconds: number;
    parentVersionId: number | null;
  }): Script {
    const now = Math.floor(Date.now() / 1000);
    const wordCount = input.bodyMd
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    const txRunner = this.db.transaction((): Script => {
      const versionRow = this.db
        .prepare('SELECT COALESCE(MAX(version), 0) AS max FROM scripts WHERE slug = ?')
        .get(input.slug) as { max: number };
      const nextVersion = versionRow.max + 1;

      const info = this.db
        .prepare(
          `INSERT INTO scripts (slug, version, title, body_md, word_count, estimated_seconds,
                                parent_version_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.slug,
          nextVersion,
          input.title,
          input.bodyMd,
          wordCount,
          input.estimatedSeconds,
          input.parentVersionId,
          now,
          now,
        );

      // Write the durable file copy. We keep the SQLite row and the file in
      // sync — either both exist or both don't. Failure writing the file
      // rolls the insert back via the transaction.
      const fileRel = path.join('scripts', `${input.slug}-v${nextVersion}.md`);
      const fileAbs = this.resolvePath(fileRel);
      writeFileSync(fileAbs, input.bodyMd, 'utf-8');

      return {
        id: Number(info.lastInsertRowid),
        slug: input.slug,
        version: nextVersion,
        title: input.title,
        bodyMd: input.bodyMd,
        wordCount,
        estimatedSeconds: input.estimatedSeconds,
        parentVersionId: input.parentVersionId,
        createdAt: now,
        updatedAt: now,
      };
    });
    return txRunner();
  }
}
