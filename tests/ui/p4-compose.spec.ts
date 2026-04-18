import { _electron as electron, expect, test } from '@playwright/test';
import * as path from 'node:path';

// Phase 6 Playwright-Electron smoke. Launches the app and asserts it
// renders — the full composition → preview → render flow requires Jobs
// tray observability (Phase 7) and a bundled Chrome-for-Testing on the
// CI runner (Phase 8). This smoke protects against module-graph
// regressions that break the renderer on boot.

test('app launches with the Compose module wired in', async () => {
  const app = await electron.launch({
    args: [path.resolve(__dirname, '..', '..', 'dist', 'main', 'bootstrap.js')],
    env: {
      ...process.env,
      APPDATA: path.resolve(__dirname, '..', '..', 'tests', '.lumo-appdata-p4'),
    },
    timeout: 30_000,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await expect(window.locator('h1', { hasText: 'Lumo' })).toBeVisible();
  await app.close();
});
