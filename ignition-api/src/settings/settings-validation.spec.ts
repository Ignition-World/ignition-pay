import { assertValidSettings } from './settings.service';

describe('assertValidSettings', () => {
  it('accepts sane numbers and booleans', () => {
    expect(() => assertValidSettings({ sessionTtlSeconds: 3600, sessionPersistenceEnabled: false })).not.toThrow();
  });

  it('rejects negative, huge, non-finite and non-numeric values', () => {
    for (const bad of [-1, 1e12, NaN, Infinity, 'x'.repeat(1000)]) {
      expect(() => assertValidSettings({ sessionTtlSeconds: bad as never })).toThrow('Invalid value');
    }
  });
});
