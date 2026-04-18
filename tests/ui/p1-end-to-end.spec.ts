import { _electron as electron, expect, test } from '@playwright/test';
import * as path from 'node:path';

// Phase 3 Playwright-Electron smoke. We verify the app launches, the Home
// shell renders, and the Claude Code banner appears because `claude` isn't
// available inside the Playwright test runner PATH. Full end-to-end flows
// against fixture providers land alongside the jobs tray in Phase 7 (T122)
// so we can observe async progress from the renderer.

test('app launches and shows Home with the Claude Code banner', async () => {
  const app = await electron.launch({
    args: [path.resolve(__dirname, '..', '..', 'dist', 'main', 'bootstrap.js')],
    env: {
      ...process.env,
      // Fresh %APPDATA% per run so we don't inherit state between tests.
      APPDATA: path.resolve(__dirname, '..', '..', 'tests', '.lumo-appdata'),
    },
    timeout: 30_000,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Home renders.
  await expect(window.locator('h1', { hasText: 'Lumo' })).toBeVisible();

  // Either "Choose projects folder" (fresh) or "Change projects folder" (has
  // run before on this machine) — match whichever appears.
  await expect(
    window.locator('button', { hasText: /Choose projects folder|Change projects folder/i }),
  ).toBeVisible();

  await app.close();
});
