import { StrKey } from '@stellar/stellar-sdk';
import { ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

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

/** class-validator constraint: the value must pass full StrKey (checksum) validation. */
@ValidatorConstraint({ name: 'isStellarAddress', async: false })
export class IsStellarAddressConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidStellarAddress(value);
  }

  defaultMessage(): string {
    return 'address must be a valid Stellar address (checksum failed or malformed)';
  }
}
