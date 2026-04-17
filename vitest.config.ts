import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: false,
    // Empty test runs are not failures during scaffolding phases. Contract +
    // integration tests arrive in Phase 3 onward; this keeps CI green until
    // then without masking real failures (vitest still fails on any failing
    // test that does exist).
    passWithNoTests: true,
    include: ['tests/contract/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['tests/ui/**', 'node_modules', 'dist', 'out'],
    environment: 'node',
    environmentMatchGlobs: [
      // Renderer-facing unit tests can opt into jsdom by naming the file
      // `*.jsdom.test.ts` — main/IPC/provider tests default to node.
      ['**/*.jsdom.test.ts', 'jsdom'],
    ],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/main/**', 'src/shared/**', 'src/renderer/services/**'],
    },
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@preload': resolve(__dirname, 'src/preload'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
});
