import { handle } from './index.js';
import * as elevenlabs from '@main/providers/elevenlabs.js';
import * as heygen from '@main/providers/heygen.js';

// Surfaces the stock catalogues so an operator with no trained voice/avatar
// can still run US1 end-to-end.

export function registerStockIpc(): void {
  handle('voices.listStock', async () => elevenlabs.listStockVoices());
  handle('avatars.listStock', async () => heygen.listStockAvatars());
}
