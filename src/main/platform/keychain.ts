import * as keytar from 'keytar';
import { ProviderError, type ProviderName } from '@shared/errors.js';

// Typed keytar wrapper. Targets are namespaced under "Lumo/" per
// constitutional Non-negotiable #3 (secrets in the OS credential store only).
//
// `account` is always `'default'` in v1 — there's one operator and one
// credential per provider. The parameter is retained for when we add S3
// buckets with distinct access keys.

export type KeychainTarget = 'Lumo/elevenlabs' | 'Lumo/heygen' | 'Lumo/s3';

const DEFAULT_ACCOUNT = 'default';

function providerFromTarget(target: KeychainTarget): ProviderName {
  if (target === 'Lumo/elevenlabs') return 'elevenlabs';
  if (target === 'Lumo/heygen') return 'heygen';
  return 's3';
}

export async function get(
  target: KeychainTarget,
  account: string = DEFAULT_ACCOUNT,
): Promise<string | null> {
  try {
    return await keytar.getPassword(target, account);
  } catch (cause) {
    throw new ProviderError({
      provider: providerFromTarget(target),
      code: 'keychain_read_failed',
      message: `Could not read secret from the Windows Credential Manager (${target}).`,
      nextStep: 'Open Windows Credential Manager and confirm the entry exists and is not locked.',
      cause,
    });
  }
}

export async function set(
  target: KeychainTarget,
  value: string,
  account: string = DEFAULT_ACCOUNT,
): Promise<void> {
  if (value.length === 0) {
    throw new ProviderError({
      provider: providerFromTarget(target),
      code: 'keychain_empty_value',
      message: 'Refusing to store an empty credential.',
    });
  }
  try {
    await keytar.setPassword(target, account, value);
  } catch (cause) {
    throw new ProviderError({
      provider: providerFromTarget(target),
      code: 'keychain_write_failed',
      message: `Could not write secret to the Windows Credential Manager (${target}).`,
      nextStep: 'Confirm the Credential Manager service is running and try again.',
      cause,
    });
  }
}

export async function clear(
  target: KeychainTarget,
  account: string = DEFAULT_ACCOUNT,
): Promise<boolean> {
  try {
    return await keytar.deletePassword(target, account);
  } catch (cause) {
    throw new ProviderError({
      provider: providerFromTarget(target),
      code: 'keychain_delete_failed',
      message: `Could not delete secret from the Windows Credential Manager (${target}).`,
      cause,
    });
  }
}
