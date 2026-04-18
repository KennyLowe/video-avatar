import type Database from 'better-sqlite3';
import { RepositoryBase } from './base.js';
import type { Voice, VoiceStatus, VoiceTier } from '@shared/schemas/voice.js';

interface RawRow {
  id: number;
  provider: 'elevenlabs';
  provider_voice_id: string | null;
  tier: VoiceTier;
  name: string;
  sample_seconds: number;
  job_id: number | null;
  status: VoiceStatus;
  created_at: number;
}

export class VoicesRepository extends RepositoryBase {
  constructor(db: Database.Database, projectsRoot: string, slug: string) {
    super(db, projectsRoot, slug);
  }

  create(input: {
    tier: VoiceTier;
    name: string;
    sampleSeconds: number;
    jobId: number | null;
  }): Voice {
    const now = Math.floor(Date.now() / 1000);
    const info = this.db
      .prepare(
        `INSERT INTO voices (provider, provider_voice_id, tier, name, sample_seconds, job_id, status, created_at)
         VALUES ('elevenlabs', NULL, ?, ?, ?, ?, 'training', ?)`,
      )
      .run(input.tier, input.name, input.sampleSeconds, input.jobId, now);
    const voice = this.get(Number(info.lastInsertRowid));
    if (voice === null) throw new Error('Failed to read back inserted voice');
    return voice;
  }

  markReady(id: number, providerVoiceId: string): Voice {
    this.db
      .prepare("UPDATE voices SET provider_voice_id = ?, status = 'ready' WHERE id = ?")
      .run(providerVoiceId, id);
    const voice = this.get(id);
    if (voice === null) throw new Error(`Voice ${id} vanished during markReady`);
    return voice;
  }

  markFailed(id: number): void {
    this.db.prepare("UPDATE voices SET status = 'failed' WHERE id = ?").run(id);
  }

  markCanceled(id: number): void {
    this.db.prepare("UPDATE voices SET status = 'canceled' WHERE id = ?").run(id);
  }

  list(): Voice[] {
    const rows = this.db
      .prepare(
        `SELECT id, provider, provider_voice_id, tier, name, sample_seconds,
                job_id, status, created_at
         FROM voices ORDER BY created_at DESC`,
      )
      .all() as RawRow[];
    return rows.map((r) => this.fromRow(r));
  }

  get(id: number): Voice | null {
    const row = this.db
      .prepare(
        `SELECT id, provider, provider_voice_id, tier, name, sample_seconds,
                job_id, status, created_at
         FROM voices WHERE id = ?`,
      )
      .get(id) as RawRow | undefined;
    return row ? this.fromRow(row) : null;
  }

  getByJobId(jobId: number): Voice | null {
    const row = this.db
      .prepare(
        `SELECT id, provider, provider_voice_id, tier, name, sample_seconds,
                job_id, status, created_at
         FROM voices WHERE job_id = ?`,
      )
      .get(jobId) as RawRow | undefined;
    return row ? this.fromRow(row) : null;
  }

  private fromRow(r: RawRow): Voice {
    return {
      id: r.id,
      provider: r.provider,
      providerVoiceId: r.provider_voice_id,
      tier: r.tier,
      name: r.name,
      sampleSeconds: r.sample_seconds,
      jobId: r.job_id,
      status: r.status,
      createdAt: r.created_at,
    };
  }
}
