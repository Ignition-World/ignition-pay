/**
 * Private key handling policy (Issue #418).
 * Documents and enforces the rules for private key material in wallets.service.ts:
 * - Private keys must NEVER be stored in the database.
 * - Private keys must NEVER be logged.
 * - Private keys must only exist in memory for the duration of signing.
 * - After signing, the reference must be cleared (set to null/undefined).
 */
export const PRIVATE_KEY_POLICY = {
  NEVER_STORE_IN_DB: true,
  NEVER_LOG: true,
  CLEAR_AFTER_SIGNING: true,
} as const;

export function assertKeyNotLoggable(key: string | undefined): void {
  if (key && key.length > 0) {
    throw new Error(
      'Private key material must not be passed to a logging function. Clear the reference first.',
    );
  }
}