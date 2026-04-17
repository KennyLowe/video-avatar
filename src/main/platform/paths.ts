import { mkdirSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Every path in Lumo is absolute and built through path.resolve / path.join.
// String concatenation is a lint error (Non-negotiable #6). This module is
// the only place that knows where %APPDATA%/Lumo lives.
//
// `%APPDATA%` is a Windows env var (our sole target platform per the
// constitution). We intentionally don't go through `electron.app.getPath`
// here — keeping this module electron-free makes it importable from tests
// and build scripts without needing the Electron binary on disk.

let cachedAppDataRoot: string | null = null;

export function getAppDataRoot(): string {
  if (cachedAppDataRoot !== null) return cachedAppDataRoot;
  const appData = process.env['APPDATA'] ?? path.resolve(os.homedir(), 'AppData', 'Roaming');
  const root = path.resolve(appData, 'Lumo');
  mkdirSync(root, { recursive: true });
  cachedAppDataRoot = root;
  return root;
}

/** Testing hook — forces a fresh resolve on the next call. */
export function resetPathsCacheForTests(): void {
  cachedAppDataRoot = null;
}

export function getLogsDir(): string {
  const dir = path.resolve(getAppDataRoot(), 'logs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getSettingsFilePath(): string {
  return path.resolve(getAppDataRoot(), 'settings.json');
}

export function projectDir(projectsRoot: string, slug: string): string {
  return path.resolve(projectsRoot, slug);
}

export function projectMetadataPath(projectsRoot: string, slug: string): string {
  return path.resolve(projectDir(projectsRoot, slug), 'project.json');
}

export function projectDbPath(projectsRoot: string, slug: string): string {
  return path.resolve(projectDir(projectsRoot, slug), 'state.db');
}

/**
 * Subfolders the application is allowed to create and own inside a project.
 * Enumerated once here so tests and the provisioning code agree.
 */
export const PROJECT_SUBFOLDERS = [
  'audio/takes',
  'audio/tts',
  'video/source',
  'video/segments',
  'video/avatar',
  'scripts',
  'renders',
  'templates',
  'logs',
  'exports',
] as const;
