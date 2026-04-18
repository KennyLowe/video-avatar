import init0001 from './0001_init.sql?raw';
import type { InlineMigration } from './runner.js';

// Every migration shipped with the app. Vite inlines the .sql contents via
// `?raw` so no sibling `migrations/` folder needs to be copied next to
// `bootstrap.js` at build time. Add new rows in version-ascending order;
// the runner handles the rest.

export const BUNDLED_MIGRATIONS: readonly InlineMigration[] = [
  { version: 1, sql: init0001 },
];
