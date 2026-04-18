import type Database from 'better-sqlite3';
import { RepositoryBase } from './base.js';
import type { Avatar, AvatarStatus, AvatarTier } from '@shared/schemas/avatar.js';

interface RawRow {
  id: number;
  provider: 'heygen';
  provider_avatar_id: string | null;
  tier: AvatarTier;
  source_ref: string;
  job_id: number | null;
  status: AvatarStatus;
  created_at: number;
}

export class AvatarsRepository extends RepositoryBase {
  constructor(db: Database.Database, projectsRoot: string, slug: string) {
    super(db, projectsRoot, slug);
  }

  create(input: { tier: AvatarTier; sourceRef: string; jobId: number | null }): Avatar {
    const now = Math.floor(Date.now() / 1000);
    const info = this.db
      .prepare(
        `INSERT INTO avatars (provider, provider_avatar_id, tier, source_ref, job_id, status, created_at)
         VALUES ('heygen', NULL, ?, ?, ?, 'training', ?)`,
      )
      .run(input.tier, input.sourceRef, input.jobId, now);
    const row = this.get(Number(info.lastInsertRowid));
    if (row === null) throw new Error('Failed to read back inserted avatar');
    return row;
  }

  list(): Avatar[] {
    const rows = this.db
      .prepare(
        `SELECT id, provider, provider_avatar_id, tier, source_ref, job_id, status, created_at
         FROM avatars ORDER BY created_at DESC`,
      )
      .all() as RawRow[];
    return rows.map((r) => this.fromRow(r));
  }

  get(id: number): Avatar | null {
    const row = this.db
      .prepare(
        `SELECT id, provider, provider_avatar_id, tier, source_ref, job_id, status, created_at
         FROM avatars WHERE id = ?`,
      )
      .get(id) as RawRow | undefined;
    return row ? this.fromRow(row) : null;
  }

  markReady(id: number, providerAvatarId: string): Avatar {
    this.db
      .prepare("UPDATE avatars SET provider_avatar_id = ?, status = 'ready' WHERE id = ?")
      .run(providerAvatarId, id);
    const next = this.get(id);
    if (next === null) throw new Error(`Avatar ${id} vanished during markReady`);
    return next;
  }

  markFailed(id: number): void {
    this.db.prepare("UPDATE avatars SET status = 'failed' WHERE id = ?").run(id);
  }

  markCanceled(id: number): void {
    this.db.prepare("UPDATE avatars SET status = 'canceled' WHERE id = ?").run(id);
  }

  private fromRow(r: RawRow): Avatar {
    return {
      id: r.id,
      provider: r.provider,
      providerAvatarId: r.provider_avatar_id,
      tier: r.tier,
      sourceRef: r.source_ref,
      jobId: r.job_id,
      status: r.status,
      createdAt: r.created_at,
    };
  }
}
