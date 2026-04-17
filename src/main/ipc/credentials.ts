import { handle } from './index.js';
import * as keychain from '@main/platform/keychain.js';
import { verifyInstalled as verifyClaudeCodeInstalled } from '@main/providers/claudeCode.js';

// Phase 2 provides the status read-side and the Claude Code recheck action.
// Real provider Test actions (elevenlabs, heygen) arrive with their wrappers
// in Phase 3 T047.

export function registerCredentialsIpc(): void {
  handle('credentials.status', async () => {
    const [elevenlabs, heygen, s3, claude] = await Promise.all([
      keychain.get('Lumo/elevenlabs'),
      keychain.get('Lumo/heygen'),
      keychain.get('Lumo/s3'),
      verifyClaudeCodeInstalled(),
    ]);
    return {
      elevenlabs: elevenlabs !== null,
      heygen: heygen !== null,
      s3: s3 !== null,
      claudeCode: claude,
    };
  });

  handle('credentials.recheckClaudeCode', async () => verifyClaudeCodeInstalled());
}
