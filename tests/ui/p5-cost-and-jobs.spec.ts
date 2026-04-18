import { _electron as electron, expect, test } from '@playwright/test';
import * as path from 'node:path';

// Phase 7 smoke. A full CSV-export-round-trip requires a project with
// persisted cost rows (Electron-ABI SQLite under Node won't bind under
// Playwright-Electron's default runtime), which arrives with the Phase 8
// Electron test harness (T146). For now we protect against module-graph
// regressions that would break the renderer's boot.

test('app launches with the Jobs + Settings wiring present', async () => {
  const app = await electron.launch({
    args: [path.resolve(__dirname, '..', '..', 'dist', 'main', 'bootstrap.js')],
    env: {
      ...process.env,
      APPDATA: path.resolve(__dirname, '..', '..', 'tests', '.lumo-appdata-p5'),
    },
    timeout: 30_000,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await expect(window.locator('h1', { hasText: 'Lumo' })).toBeVisible();
  await app.close();
});
