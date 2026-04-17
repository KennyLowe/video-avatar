import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import * as path from 'node:path';

// Every path in Lumo is absolute and built through path.resolve / path.join.
// String concatenation is a lint error (Non-negotiable #6). This module is
// the only place that knows where %APPDATA%/Lumo lives.

let cachedAppDataRoot: string | null = null;

export function getAppDataRoot(): string {
  if (cachedAppDataRoot !== null) return cachedAppDataRoot;
  // Electron's userData path defaults to %APPDATA%/<productName> on Windows.
  // We override to `%APPDATA%/Lumo` explicitly so tests and dev both land in
  // the same place regardless of the packaged product name.
  const appData = app.getPath('appData');
  const root = path.resolve(appData, 'Lumo');
  mkdirSync(root, { recursive: true });
  cachedAppDataRoot = root;
  return root;
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
