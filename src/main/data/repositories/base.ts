import type Database from 'better-sqlite3';
import * as path from 'node:path';

// Repository base. Subclasses compose prepared statements around a single db
// handle and a project root. The only thing the base actually enforces is the
// absolute-path rule (FR-055 / Non-negotiable #6): every column whose name
// ends in `_path` is resolved against the project root on read.

export abstract class RepositoryBase {
  constructor(
    protected readonly db: Database.Database,
    protected readonly projectsRoot: string,
    protected readonly slug: string,
  ) {}

  protected resolvePath(relative: string): string {
    return path.resolve(this.projectsRoot, this.slug, relative);
  }

  protected resolvePathNullable(relative: string | null): string | null {
    if (relative === null || relative === undefined) return null;
    return this.resolvePath(relative);
  }

  /** Strip the project root off an absolute path so it stores relatively. */
  protected relativize(abs: string): string {
    const root = path.resolve(this.projectsRoot, this.slug);
    const rel = path.relative(root, abs);
    if (rel.startsWith('..')) {
      throw new Error(`Path escapes project root: ${abs}`);
    }
    return rel;
  }
}
