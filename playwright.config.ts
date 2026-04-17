import { defineConfig } from '@playwright/test';

// Playwright-Electron runs against the packaged or built app. Each spec launches
// Electron itself via `_electron.launch({ args: ['dist/main/bootstrap.js'] })`
// so no webServer block is needed here. Run with `npm run test:ui`.
export default defineConfig({
  testDir: 'tests/ui',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'electron-win',
      use: {},
    },
  ],
});
