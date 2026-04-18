import type Database from 'better-sqlite3';
import { RepositoryBase } from './base.js';
import type { Render } from '@shared/schemas/render.js';

export class RendersRepository extends RepositoryBase {
  constructor(db: Database.Database, projectsRoot: string, slug: string) {
    super(db, projectsRoot, slug);
  }

  create(input: {
    kind: Render['kind'];
    scriptId: number | null;
    voiceId: number | null;
    avatarId: number | null;
    generationMode: Render['generationMode'];
    templateId: string | null;
    propsJson: string | null;
    outputPath: string;
  }): Render {
    const now = Math.floor(Date.now() / 1000);
    const info = this.db
      .prepare(
        `INSERT INTO renders (kind, script_id, voice_id, avatar_id, generation_mode,
                              template_id, props_json, output_path, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'done', ?)`,
      )
      .run(
        input.kind,
        input.scriptId,
        input.voiceId,
        input.avatarId,
        input.generationMode,
        input.templateId,
        input.propsJson,
        input.outputPath,
        now,
      );
    return {
      id: Number(info.lastInsertRowid),
      kind: input.kind,
      scriptId: input.scriptId,
      voiceId: input.voiceId,
      avatarId: input.avatarId,
      generationMode: input.generationMode,
      templateId: input.templateId,
      propsJson: input.propsJson,
      outputPath: input.outputPath,
      status: 'done',
      createdAt: now,
    };
  }
}
