import { readFileSync, writeFileSync } from 'node:fs';
import {
  AppSettingsSchema,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
} from '@shared/schemas/settings.js';
import { getSettingsFilePath } from './paths.js';

// App-global settings at %APPDATA%/Lumo/settings.json. Reads are cached in
// memory; writes are synchronous — we don't expect this to be hot.

let cache: AppSettings | null = null;

export function getSettings(): AppSettings {
  if (cache !== null) return cache;
  cache = load();
  return cache;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = AppSettingsSchema.parse({ ...getSettings(), ...patch });
  writeFileSync(getSettingsFilePath(), JSON.stringify(next, null, 2), 'utf-8');
  cache = next;
  return next;
}

function load(): AppSettings {
  const filePath = getSettingsFilePath();
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    // First run — write defaults through so the file exists.
    writeFileSync(filePath, JSON.stringify(DEFAULT_APP_SETTINGS, null, 2), 'utf-8');
    return DEFAULT_APP_SETTINGS;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    // Merge with defaults so new fields added in a later version don't blow up
    // on an older settings file.
    const merged = { ...DEFAULT_APP_SETTINGS, ...(parsed as Record<string, unknown>) };
    return AppSettingsSchema.parse(merged);
  } catch {
    // Corrupt file — refuse to lose the operator's data silently, but don't
    // crash. Back up the bad file and rewrite defaults.
    writeFileSync(`${filePath}.corrupt`, raw, 'utf-8');
    writeFileSync(filePath, JSON.stringify(DEFAULT_APP_SETTINGS, null, 2), 'utf-8');
    return DEFAULT_APP_SETTINGS;
  }
}

export function resetSettingsCacheForTests(): void {
  cache = null;
}
