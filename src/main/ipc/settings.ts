import { dialog, BrowserWindow } from 'electron';
import { handle } from './index.js';
import { getSettings, updateSettings } from '@main/platform/settings.js';
import { AppSettingsSchema, type AppSettings } from '@shared/schemas/settings.js';

// Phase 2 surface: get / update / pickProjectsRoot. The full Settings screen
// behaviour lands in Phase 7 T125.

export function registerSettingsIpc(): void {
  handle('settings.get', async () => getSettings());

  handle('settings.update', async (input) => {
    const parsed = AppSettingsSchema.partial().parse(input);
    // Strip explicit `undefined` values so the patch shape satisfies the
    // app's `exactOptionalPropertyTypes` stance (properties may be absent,
    // never explicitly undefined).
    const patch: Partial<AppSettings> = Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => v !== undefined),
    ) as Partial<AppSettings>;
    return updateSettings(patch);
  });

  handle('settings.pickProjectsRoot', async () => {
    const focused = BrowserWindow.getFocusedWindow() ?? undefined;
    const result = focused
      ? await dialog.showOpenDialog(focused, {
          title: 'Choose a folder for Lumo projects',
          properties: ['openDirectory', 'createDirectory'],
        })
      : await dialog.showOpenDialog({
          title: 'Choose a folder for Lumo projects',
          properties: ['openDirectory', 'createDirectory'],
        });
    if (result.canceled || result.filePaths.length === 0) return null;
    const picked = result.filePaths[0] ?? null;
    if (picked === null) return null;
    updateSettings({ projectsRoot: picked });
    return picked;
  });
}
