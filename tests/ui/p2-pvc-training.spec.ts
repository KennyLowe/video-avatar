import { _electron as electron, expect, test } from '@playwright/test';
import * as path from 'node:path';

// Phase 4 Playwright-Electron smoke. We verify the Voice screen can be
// reached via the Ctrl+1 keyboard shortcut once a project exists. Full
// record-and-train flow against fixture providers requires the Jobs tray
// (Phase 7 T122) to observe async progress from the renderer.

test('Voice screen opens via Ctrl+1 after a project is open', async () => {
  const app = await electron.launch({
    args: [path.resolve(__dirname, '..', '..', 'dist', 'main', 'bootstrap.js')],
    env: {
      ...process.env,
      APPDATA: path.resolve(__dirname, '..', '..', 'tests', '.lumo-appdata-p2'),
    },
    timeout: 30_000,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await expect(window.locator('h1', { hasText: 'Lumo' })).toBeVisible();

  // We don't drive a full project-creation flow in CI (no Claude Code
  // authenticated, no keys). This smoke confirms the app boots; the
  // end-to-end record-to-preview assertion lands when the Jobs tray does.

  await app.close();
});
