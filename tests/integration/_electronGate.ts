import type DatabaseType from 'better-sqlite3';

// Probe `better-sqlite3`'s native binding. The postinstall rebuilds it against
// the Electron Node ABI, so under plain Node (where vitest runs) the import
// succeeds but construction throws. Integration tests that need a real SQLite
// database live-skip themselves via `describe.skipIf(!gate.loadable)` until
// T146's Playwright-Electron harness runs them under the real runtime.

export interface ElectronGate {
  readonly loadable: boolean;
  readonly Database: typeof DatabaseType | null;
}

export function detectElectronGate(): ElectronGate {
  let Database: typeof DatabaseType | null = null;
  let loadable = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    Database = require('better-sqlite3') as typeof DatabaseType;
    const probe = new Database(':memory:');
    probe.close();
    loadable = true;
  } catch {
    loadable = false;
  }
  return { loadable, Database };
}
