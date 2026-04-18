import { handle } from './index.js';
import * as keychain from '@main/platform/keychain.js';
import { verifyInstalled as verifyClaudeCodeInstalled } from '@main/providers/claudeCode.js';
import * as elevenlabs from '@main/providers/elevenlabs.js';
import * as heygen from '@main/providers/heygen.js';

// credentials.* IPC surface: status + Test + set + clear + recheck.
// FR-002, FR-003, FR-004, FR-005.

export function registerCredentialsIpc(): void {
  handle('credentials.status', async () => {
    const [e, h, s, claude] = await Promise.all([
      keychain.get('Lumo/elevenlabs'),
      keychain.get('Lumo/heygen'),
      keychain.get('Lumo/s3'),
      verifyClaudeCodeInstalled(),
    ]);
    return {
      elevenlabs: e !== null,
      heygen: h !== null,
      s3: s !== null,
      claudeCode: claude,
    };
  });

  handle('credentials.recheckClaudeCode', async () => verifyClaudeCodeInstalled());

  // Test MUST hit the provider before persisting the credential. The flow:
  //  1. UI posts a tentative key.
  //  2. We write it to the keychain.
  //  3. We call the provider's Test endpoint.
  //  4. On failure, we clear the key (so the UI reflects "not configured")
  //     and bubble the ProviderError up.
  handle('credentials.test', async (input) => {
    const { provider, key } = input as { provider: 'elevenlabs' | 'heygen'; key: string };
    const target = provider === 'elevenlabs' ? 'Lumo/elevenlabs' : 'Lumo/heygen';
    await keychain.set(target, key);
    try {
      return provider === 'elevenlabs' ? await elevenlabs.testKey() : await heygen.testKey();
    } catch (err) {
      await keychain.clear(target).catch(() => undefined);
      throw err;
    }
  });

  handle('credentials.set', async (input) => {
    const { provider, key } = input as { provider: 'elevenlabs' | 'heygen'; key: string };
    const target = provider === 'elevenlabs' ? 'Lumo/elevenlabs' : 'Lumo/heygen';
    await keychain.set(target, key);
  });

  handle('credentials.clear', async (input) => {
    const { provider } = input as { provider: 'elevenlabs' | 'heygen' };
    const target = provider === 'elevenlabs' ? 'Lumo/elevenlabs' : 'Lumo/heygen';
    await keychain.clear(target);
  });
}
