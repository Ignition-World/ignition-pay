/**
 * Centralised decimal amount validator (Issue #414).
 * Replaces ad-hoc per-module amount validation with a single shared rule:
 * - Must be a numeric string
 * - At most 7 decimal places (Stellar stroop precision)
 * - Greater than 0
 * - At most 20 significant digits
 */
export const DECIMAL_AMOUNT_REGEX = /^\d{1,20}(\.\d{1,7})?$/;

export function isValidDecimalAmount(value: string): boolean {
  if (!DECIMAL_AMOUNT_REGEX.test(value)) return false;
  return parseFloat(value) > 0;
}

export function validateDecimalAmount(value: string): void {
  if (!isValidDecimalAmount(value)) {
    throw new Error(
      `Invalid amount "${value}". Must be a positive decimal with at most 7 decimal places.`,
    );
  }
}