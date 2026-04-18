#!/usr/bin/env node
// Re-copy the local ESLint plugin (.eslint-rules/) into
// node_modules/eslint-plugin-lumo/ so rule edits made after the last
// `npm install` actually take effect when `npm run lint` fires.
//
// Why we need this: the top-level package.json declares
//   "eslint-plugin-lumo": "file:./.eslint-rules"
// and the repo's .npmrc sets install-links=true (because SMB/network shares
// can't create Windows symlinks). install-links copies the plugin once at
// install time; later edits to .eslint-rules/*.cjs don't propagate on their
// own. This script runs as a `prelint` hook so lint always sees the latest.
//
// Safe to run before `npm install` has happened — the node_modules/ check
// short-circuits so this can't create the install dir.

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve(process.cwd(), '.eslint-rules');
const nodeModules = resolve(process.cwd(), 'node_modules');
const destination = resolve(nodeModules, 'eslint-plugin-lumo');

if (!existsSync(nodeModules)) {
  // Fresh clone before `npm install`; nothing to sync.
  process.exit(0);
}

if (!existsSync(source)) {
  console.error(`[sync-eslint-plugin] missing source directory: ${source}`);
  process.exit(1);
}

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true, force: true });
