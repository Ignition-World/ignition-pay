import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  IsDecimalAmountConstraint,
  compareDecimalStrings,
  MINIMUM_PAYMENT_AMOUNT,
} from './is-decimal-amount.decorator';
import { IsDecimalAmount } from './is-decimal-amount.decorator';

// ---------------------------------------------------------------------------
// Helper DTO for integration-style decorator tests
// ---------------------------------------------------------------------------
class TestDto {
  @IsDecimalAmount()
  amount!: string;
}

async function validationErrors(amount: unknown): Promise<string[]> {
  const instance = plainToInstance(TestDto, { amount });
  const errors = await validate(instance);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

// ---------------------------------------------------------------------------
// IsDecimalAmountConstraint unit tests
// ---------------------------------------------------------------------------
describe('IsDecimalAmountConstraint', () => {
  let constraint: IsDecimalAmountConstraint;

  beforeEach(() => {
    constraint = new IsDecimalAmountConstraint();
  });

  // ---- valid inputs ----
  describe('valid amounts', () => {
    const validCases = [
      MINIMUM_PAYMENT_AMOUNT,           // exact minimum
      '0.0000002',                       // just above minimum
      '1',                              // integer
      '1.0',                            // integer with decimal
      '1.5000000',                      // 7 decimal places
      '9999999999999.0000001',          // 13 integer + 7 decimal = 20 significant
      '100.00',
      '0.1',
      '0.0000001',                      // 1 stroop — the floor
      '1234567890123',                  // 13 integer digits only
    ];

    it.each(validCases)('accepts "%s"', (value) => {
      expect(constraint.validate(value)).toBe(true);
    });
  });

  // ---- too many decimal places ----
  describe('exceeds 7 decimal places', () => {
    const tooManyDecimals = [
      '1.00000001',  // 8 decimal places
      '0.00000001',  // 8 decimal places (also sub-minimum)
      '100.12345678',
    ];

    it.each(tooManyDecimals)('rejects "%s" (>7 decimal places)', (value) => {
      expect(constraint.validate(value)).toBe(false);
    });
  });

  // ---- exceeds 20 total significant digits ----
  describe('exceeds 20 total significant digits', () => {
    const tooManyDigits = [
      '99999999999999.0000001',  // 14 + 7 = 21 significant digits
      '1234567890123456789012',  // 22 integer digits
      '12345678901234.1234567',  // 14 + 7 = 21
    ];

    it.each(tooManyDigits)('rejects "%s" (>20 total digits)', (value) => {
      expect(constraint.validate(value)).toBe(false);
    });
  });

  // ---- sub-minimum amounts ----
  describe('sub-minimum amounts (< 0.0000001)', () => {
    const subMinimum = [
      '0.00000009',  // 8 decimal places AND sub-minimum
      '0.0000000',   // zero with decimals
      '0',
      '0.0',
    ];

    it.each(subMinimum)('rejects "%s" (below minimum)', (value) => {
      expect(constraint.validate(value)).toBe(false);
    });
  });

  // ---- malformed / non-numeric strings ----
  describe('malformed inputs', () => {
    const malformed = [
      '',               // empty string
      '  ',             // whitespace only
      'abc',            // letters
      '1e5',            // scientific notation
      '+100',           // positive sign
      '-1',             // negative sign
      '-0.5',           // negative decimal
      '1_000',          // underscore separator
      '1,000',          // comma separator
      '.5',             // leading decimal (no leading zero)
      '1.',             // trailing decimal point
      '01',             // invalid leading zero
      '00.1',           // double leading zero
      'NaN',
      'Infinity',
      '1.2.3',          // multiple decimal points
    ];

    it.each(malformed)('rejects "%s" (malformed)', (value) => {
      expect(constraint.validate(value)).toBe(false);
    });
  });

  // ---- non-string inputs ----
  describe('non-string inputs', () => {
    const nonStrings: unknown[] = [
      100,
      0.5,
      null,
      undefined,
      true,
      {},
      [],
    ];

    it.each(nonStrings)('rejects %p (not a string)', (value) => {
      expect(constraint.validate(value)).toBe(false);
    });
  });

  // ---- default message ----
  it('returns a descriptive default message', () => {
    const msg = constraint.defaultMessage();
    expect(msg).toContain('7 decimal places');
    expect(msg).toContain('20 total significant digits');
    expect(msg).toContain(MINIMUM_PAYMENT_AMOUNT);
  });
});

// ---------------------------------------------------------------------------
// compareDecimalStrings
// ---------------------------------------------------------------------------
describe('compareDecimalStrings', () => {
  it('returns 0 for equal values', () => {
    expect(compareDecimalStrings('1.5', '1.5')).toBe(0);
    expect(compareDecimalStrings('0.0000001', '0.0000001')).toBe(0);
    expect(compareDecimalStrings('100', '100')).toBe(0);
  });

  it('returns positive when a > b', () => {
    expect(compareDecimalStrings('1.5', '1.4')).toBeGreaterThan(0);
    expect(compareDecimalStrings('2', '1.9999999')).toBeGreaterThan(0);
    expect(compareDecimalStrings('0.0000002', '0.0000001')).toBeGreaterThan(0);
    expect(compareDecimalStrings('10', '9')).toBeGreaterThan(0);
  });

  it('returns negative when a < b', () => {
    expect(compareDecimalStrings('1.4', '1.5')).toBeLessThan(0);
    expect(compareDecimalStrings('0.0000001', '0.0000002')).toBeLessThan(0);
    expect(compareDecimalStrings('9', '10')).toBeLessThan(0);
  });

  it('handles integers vs decimals correctly', () => {
    expect(compareDecimalStrings('1', '1.0')).toBe(0);
    expect(compareDecimalStrings('1', '1.0000001')).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// Integration tests via class-validator
// ---------------------------------------------------------------------------
describe('IsDecimalAmount decorator (integration)', () => {
  it('passes for a valid amount', async () => {
    const errors = await validationErrors('100.5');
    expect(errors).toHaveLength(0);
  });

  it('fails and includes descriptive message for sub-minimum amount', async () => {
    const errors = await validationErrors('0.00000000');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain(MINIMUM_PAYMENT_AMOUNT);
  });

  it('fails for a number type (expects string)', async () => {
    const errors = await validationErrors(100);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails for scientific notation', async () => {
    const errors = await validationErrors('1e7');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails for a negative amount', async () => {
    const errors = await validationErrors('-1.0');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails for too many decimal places', async () => {
    const errors = await validationErrors('1.00000001');
    expect(errors.length).toBeGreaterThan(0);
  });
});
