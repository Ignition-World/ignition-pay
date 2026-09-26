import { StrKey } from '@stellar/stellar-sdk';

/**
 * Stellar STR address validator (Issue #421).
 * Validates a Stellar address against the full STR format:
 * - Must start with 'G' (Ed25519 public key)
 * - Base32 decodeable
 * - Valid CRC-16 checksum
 * - 32-byte payload
 */
export function isValidStellarAddress(address: string): boolean {
  if (!address || !address.startsWith('G')) return false;
  try {
    return StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
}

export function assertValidStellarAddress(address: string): void {
  if (!isValidStellarAddress(address)) {
    throw new Error(
      `"${address}" is not a valid Stellar STR address. ` +
      'Must start with G and pass full StrKey validation.',
    );
  }
}