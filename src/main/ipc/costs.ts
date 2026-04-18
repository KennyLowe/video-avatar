import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { handle } from './index.js';
import { getSettings } from '@main/platform/settings.js';
import { openProjectDb } from '@main/data/db.js';
import { CostsRepository } from '@main/data/repositories/costs.js';
import { projectDir } from '@main/platform/paths.js';
import * as elevenlabs from '@main/providers/elevenlabs.js';
import * as heygen from '@main/providers/heygen.js';
import { logger } from '@main/logging/jsonl.js';
import { costsToCsv } from '@main/services/costsCsv.js';

// costs.* IPC per contracts/ipc-bridge.md + FR-049 / FR-050. Combined MTD
// returns both the local ledger totals and the provider's own reported
// usage (when testKey exposes it).

export function registerCostsIpc(): void {
  handle('costs.mtd', async (input) => {
    const { slug } = input as { slug: string };
    const root = requireRoot();
    const db = openProjectDb({ projectsRoot: root, slug });
    const costs = new CostsRepository(db, root, slug);
    const local = Object.fromEntries(costs.mtd().map((r) => [r.provider, r.totalUsd]));
    // Fetch provider-reported usage in parallel. Either can fail (no cred
    // configured, provider outage). Surface as null per provider — UI
    // renders "—" when unavailable.
    const [elevenlabsPlan, heygenPlan] = await Promise.all([
      elevenlabs.testKey().catch((err) => {
        logger.debug('costs.mtd elevenlabs probe failed', {
          message: err instanceof Error ? err.message : String(err),
        });
        return null;
      }),
      heygen.testKey().catch((err) => {
        logger.debug('costs.mtd heygen probe failed', {
          message: err instanceof Error ? err.message : String(err),
        });
        return null;
      }),
    ]);
    return {
      local: {
        elevenlabs: local.elevenlabs ?? 0,
        heygen: local.heygen ?? 0,
        total: (local.elevenlabs ?? 0) + (local.heygen ?? 0),
      },
      providerReported: {
        elevenlabs: elevenlabsPlan
          ? { plan: elevenlabsPlan.plan, mtdCredits: elevenlabsPlan.mtdCredits }
          : null,
        heygen: heygenPlan ? { plan: heygenPlan.plan, mtdCredits: heygenPlan.mtdCredits } : null,
      },
    };
  });

  handle('costs.ledger', async (input) => {
    const { slug } = input as { slug: string };
    const root = requireRoot();
    const db = openProjectDb({ projectsRoot: root, slug });
    const costs = new CostsRepository(db, root, slug);
    return costs.listAll();
  });

  handle('costs.exportCsv', async (input) => {
    const { slug } = input as { slug: string };
    const root = requireRoot();
    const db = openProjectDb({ projectsRoot: root, slug });
    const costs = new CostsRepository(db, root, slug);
    const rows = costs.listAll();

    const exportsDir = path.resolve(projectDir(root, slug), 'exports');
    mkdirSync(exportsDir, { recursive: true });
    const filename = `costs-${new Date().toISOString().slice(0, 10)}.csv`;
    const outputPath = path.resolve(exportsDir, filename);

    writeFileSync(outputPath, costsToCsv(rows, slug), 'utf-8');
    return { path: outputPath, rowCount: rows.length };
  });
}

function requireRoot(): string {
  const root = getSettings().projectsRoot;
  if (root === null) throw new Error('No projects root configured.');
  return root;
}
