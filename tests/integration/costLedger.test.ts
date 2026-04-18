import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectElectronGate } from './_electronGate.js';
import { costsToCsv, COSTS_CSV_HEADERS } from '@main/services/costsCsv.js';

// T129 — cost ledger. Exercises CostsRepository.record + mtd against a real
// SQLite DB, then cross-checks the CSV export shape against the constitutional
// FR-049 / FR-050 contract.

const gate = detectElectronGate();

describe.skipIf(!gate.loadable)('costs ledger integration', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-costs-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('records one row per paid operation and returns combined MTD', async () => {
    const { createProject } = await import('@main/data/projects.js');
    const { openProjectDb, closeAllProjectDbs } = await import('@main/data/db.js');
    const { CostsRepository } = await import('@main/data/repositories/costs.js');

    const project = createProject(tmpRoot, 'ledger test');
    const db = openProjectDb({ projectsRoot: tmpRoot, slug: project.slug });
    const costs = new CostsRepository(db, tmpRoot, project.slug);

    costs.record({
      jobId: 1,
      provider: 'elevenlabs',
      operation: 'tts',
      units: 500,
      unitKind: 'characters',
      usdEstimate: 0.02,
    });
    costs.record({
      jobId: 1,
      provider: 'heygen',
      operation: 'avatar_video_iv',
      units: 30,
      unitKind: 'credits',
      usdEstimate: 0.5,
    });
    costs.record({
      jobId: 2,
      provider: 'elevenlabs',
      operation: 'pvc_train',
      units: 120,
      unitKind: 'seconds',
      usdEstimate: 0.1,
    });

    const all = costs.listAll();
    expect(all).toHaveLength(3);

    const mtd = Object.fromEntries(costs.mtd().map((r) => [r.provider, r.totalUsd]));
    expect(mtd.elevenlabs).toBeCloseTo(0.12, 5);
    expect(mtd.heygen).toBeCloseTo(0.5, 5);

    closeAllProjectDbs();
  });

  it('CSV export matches the expected header + row shape', async () => {
    const { createProject } = await import('@main/data/projects.js');
    const { openProjectDb, closeAllProjectDbs } = await import('@main/data/db.js');
    const { CostsRepository } = await import('@main/data/repositories/costs.js');

    const project = createProject(tmpRoot, 'csv shape');
    const db = openProjectDb({ projectsRoot: tmpRoot, slug: project.slug });
    const costs = new CostsRepository(db, tmpRoot, project.slug);
    costs.record({
      jobId: null,
      provider: 'heygen',
      operation: 'avatar_train',
      units: 1,
      unitKind: 'credits',
      usdEstimate: 2.5,
    });

    const csv = costsToCsv(costs.listAll(), project.slug);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(COSTS_CSV_HEADERS.join(','));
    expect(lines).toHaveLength(2);
    const cells = lines[1]!.split(',');
    expect(cells[1]).toBe('heygen');
    expect(cells[2]).toBe('avatar_train');
    expect(cells[5]).toBe('2.5000');
    expect(cells[6]).toBe(project.slug);
    // Empty job id when jobId is null.
    expect(cells[7]).toBe('');

    closeAllProjectDbs();
  });
});
