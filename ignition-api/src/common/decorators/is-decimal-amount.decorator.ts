import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Minimum payment amount: 1 stroop = 0.0000001 XLM / asset units.
 * Represented as a string for exact decimal comparison.
 */
export const MINIMUM_PAYMENT_AMOUNT = '0.0000001';

/**
 * Maximum total significant digits allowed by Decimal(20,7).
 * 20 digits total, up to 7 after the decimal point.
 */
const MAX_TOTAL_DIGITS = 20;
const MAX_DECIMAL_PLACES = 7;

/**
 * Validates that a value conforms to Decimal(20,7) precision and meets the
 * minimum payment threshold.
 *
 * Rules:
 *  - Must be a non-empty string
 *  - Must be a valid positive decimal number (no leading zeros except "0.xxx")
 *  - At most 7 decimal places
 *  - At most 20 total significant digits (integer digits + decimal digits)
 *  - Must be >= 0.0000001 (one stroop — the smallest Stellar unit)
 */
@ValidatorConstraint({ name: 'isDecimalAmount', async: false })
export class IsDecimalAmountConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.trim() === '') return false;

    // Accept only: optional leading digit(s), optional decimal point + digits.
    // No scientific notation, no sign prefix.
    const DECIMAL_RE = /^(0|[1-9]\d*)(\.\d+)?$/;
    if (!DECIMAL_RE.test(value)) return false;

    const [intPart, fracPart] = value.split('.');
    const decimalPlaces = fracPart ? fracPart.length : 0;

    if (decimalPlaces > MAX_DECIMAL_PLACES) return false;

    // Significant digits: strip leading zeros from integer part (there are none
    // by virtue of the regex above, but be defensive) then count all digits.
    const significantDigits = intPart.replace(/^0+/, '').length + decimalPlaces;
    // A pure "0.xxx" has 0 integer significant digits, so just count fracPart.
    const totalSignificantDigits =
      intPart === '0' ? decimalPlaces : intPart.length + decimalPlaces;

    if (totalSignificantDigits > MAX_TOTAL_DIGITS) return false;

    // Reject zero
    if (!this._isAboveZero(value)) return false;

    // Reject sub-minimum amounts (< 0.0000001)
    if (!this._meetsMinimum(value)) return false;

    return true;
  }

  defaultMessage(): string {
    return (
      `amount must be a valid decimal string with at most ${MAX_DECIMAL_PLACES} decimal places ` +
      `and at most ${MAX_TOTAL_DIGITS} total significant digits, ` +
      `and must be >= ${MINIMUM_PAYMENT_AMOUNT}`
    );
  }

  /** Returns true when the decimal string is strictly greater than zero. */
  private _isAboveZero(value: string): boolean {
    return !value.split('.').every((part) => /^0+$/.test(part));
  }

  /**
   * Compares two decimal strings lexicographically after aligning decimal places.
   * Returns true when `value` >= `MINIMUM_PAYMENT_AMOUNT`.
   */
  private _meetsMinimum(value: string): boolean {
    return compareDecimalStrings(value, MINIMUM_PAYMENT_AMOUNT) >= 0;
  }
}

/**
 * Compares two non-negative decimal strings without floating-point conversion.
 * Returns:
 *   > 0 when a > b
 *   = 0 when a === b
 *   < 0 when a < b
 */
export function compareDecimalStrings(a: string, b: string): number {
  const [aInt, aFrac = ''] = a.split('.');
  const [bInt, bFrac = ''] = b.split('.');

  // Pad integer parts to the same length for lexicographic comparison
  const maxIntLen = Math.max(aInt.length, bInt.length);
  const aPaddedInt = aInt.padStart(maxIntLen, '0');
  const bPaddedInt = bInt.padStart(maxIntLen, '0');

  if (aPaddedInt !== bPaddedInt) {
    return aPaddedInt > bPaddedInt ? 1 : -1;
  }

  // Integer parts are equal — compare fractional parts
  const maxFracLen = Math.max(aFrac.length, bFrac.length);
  const aPaddedFrac = aFrac.padEnd(maxFracLen, '0');
  const bPaddedFrac = bFrac.padEnd(maxFracLen, '0');

  if (aPaddedFrac === bPaddedFrac) return 0;
  return aPaddedFrac > bPaddedFrac ? 1 : -1;
}

/**
 * Property decorator.  Apply to string DTO fields that represent payment amounts.
 *
 * @example
 * \@IsDecimalAmount()
 * amount: string;
 */
export function IsDecimalAmount(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isDecimalAmount',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: IsDecimalAmountConstraint,
    });
  };
}
