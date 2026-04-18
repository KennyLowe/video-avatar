import { ipcMain } from 'electron';
import { logger } from '@main/logging/jsonl.js';
import { toErrorShape } from '@shared/errors.js';
import { registerProjectsIpc } from './projects.js';
import { registerSettingsIpc } from './settings.js';
import { registerCredentialsIpc } from './credentials.js';
import { registerScriptsIpc } from './scripts.js';
import { registerGenerateIpc } from './generate.js';
import { registerStockIpc } from './stock.js';
import { registerVoicesIpc } from './voices.js';

// Typed IPC bridge registry. Each handler group registers its own channels
// here; the preload script exposes a mirror surface at window.lumo.*.
//
// Error handling: every handler wraps its throw so the renderer receives
// `{ ok: false, error: ProviderErrorShape }` instead of Node exceptions. Any
// handler that resolves without throwing returns `{ ok: true, value }`.

export type IpcSuccess<T> = { ok: true; value: T };
export type IpcFailure = { ok: false; error: ReturnType<typeof toErrorShape> };
export type IpcEnvelope<T> = IpcSuccess<T> | IpcFailure;

export function registerIpcHandlers(): void {
  registerProjectsIpc();
  registerSettingsIpc();
  registerCredentialsIpc();
  registerScriptsIpc();
  registerGenerateIpc();
  registerStockIpc();
  registerVoicesIpc();
}

export function handle<T>(channel: string, fn: (..._args: unknown[]) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const value = await fn(...args);
      return { ok: true, value } satisfies IpcEnvelope<T>;
    } catch (err) {
      logger.warn('ipc.error', { channel, message: (err as Error)?.message });
      return { ok: false, error: toErrorShape(err) } satisfies IpcEnvelope<T>;
    }
  });
}
