import { _electron as electron, expect, test } from '@playwright/test';
import * as path from 'node:path';

// Phase 5 smoke. The full Avatar-screen end-to-end (import → segment →
// face-detect → submit → ready → usable in Generate) requires the Jobs
// tray to observe async progress, which lands in Phase 7 T122. For now we
// just confirm the app boots — the regression value is that a broken
// import somewhere in the avatars module graph fails loud instead of
// silently crashing the renderer.

test('app launches with the Avatar wiring present', async () => {
  const app = await electron.launch({
    args: [path.resolve(__dirname, '..', '..', 'dist', 'main', 'bootstrap.js')],
    env: {
      ...process.env,
      APPDATA: path.resolve(__dirname, '..', '..', 'tests', '.lumo-appdata-p3'),
    },
    timeout: 30_000,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await expect(window.locator('h1', { hasText: 'Lumo' })).toBeVisible();
  await app.close();
});
