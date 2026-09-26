import {
  DEFAULT_JSON_BODY_LIMIT,
  DEFAULT_URLENCODED_BODY_LIMIT,
  MAX_BODY_SIZE_LIMIT_CEILING,
  byteLimitEnvValue,
  parseByteLimit,
  resolveByteLimit,
} from './payload-limits';

const ENV_JSON = 'MAX_JSON_BODY_BYTES';
const ENV_URLENCODED = 'MAX_URLENCODED_BODY_BYTES';

describe('payload-limits', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('parseByteLimit', () => {
    it('parses a plain byte count', () => {
      expect(parseByteLimit('1048576')).toBe(1024 * 1024);
      expect(parseByteLimit(4096)).toBe(4096);
    });

    it('parses suffixed values case-insensitively with optional spaces', () => {
      expect(parseByteLimit('1mb')).toBe(1024 * 1024);
      expect(parseByteLimit('1MB')).toBe(1024 * 1024);
      expect(parseByteLimit(' 2 MB ')).toBe(2 * 1024 * 1024);
      expect(parseByteLimit('500kb')).toBe(500 * 1024);
      expect(parseByteLimit('1gb')).toBe(1024 ** 3);
      expect(parseByteLimit('10b')).toBe(10);
    });

    it('accepts fractional values', () => {
      expect(parseByteLimit('1.5mb')).toBe(Math.floor(1.5 * 1024 * 1024));
    });

    it('returns undefined for missing or unparseable values', () => {
      expect(parseByteLimit(undefined)).toBeUndefined();
      expect(parseByteLimit(null)).toBeUndefined();
      expect(parseByteLimit('')).toBeUndefined();
      expect(parseByteLimit('   ')).toBeUndefined();
      expect(parseByteLimit('lots')).toBeUndefined();
      expect(parseByteLimit('1tb')).toBeUndefined();
      expect(parseByteLimit('-1mb')).toBeUndefined();
    });
  });

  describe('byteLimitEnvValue', () => {
    it('returns undefined when the variable is unset so the default applies', () => {
      delete process.env[ENV_JSON];
      expect(byteLimitEnvValue(ENV_JSON)).toBeUndefined();
    });

    it('returns the raw env string for express to normalise', () => {
      process.env[ENV_JSON] = '2mb';
      expect(byteLimitEnvValue(ENV_JSON)).toBe('2mb');
    });

    it('trims surrounding whitespace', () => {
      process.env[ENV_JSON] = ' 3mb ';
      expect(byteLimitEnvValue(ENV_JSON)).toBe('3mb');
    });

    it('throws on a malformed value instead of silently mis-sizing it', () => {
      process.env[ENV_JSON] = 'big';
      expect(() => byteLimitEnvValue(ENV_JSON)).toThrow(
        /MAX_JSON_BODY_BYTES/,
      );
    });
  });

  describe('resolveByteLimit', () => {
    const json = (...args: any[]) =>
      resolveByteLimit(args[0], args[1], ENV_JSON, DEFAULT_JSON_BODY_LIMIT);

    beforeEach(() => {
      delete process.env[ENV_JSON];
      delete process.env[ENV_URLENCODED];
    });

    it('falls back to the built-in default when nothing is configured', () => {
      expect(json(undefined, undefined)).toBe(DEFAULT_JSON_BODY_LIMIT);
      expect(
        resolveByteLimit(
          undefined,
          undefined,
          ENV_URLENCODED,
          DEFAULT_URLENCODED_BODY_LIMIT,
        ),
      ).toBe(DEFAULT_URLENCODED_BODY_LIMIT);
    });

    it('prefers the environment override over the default', () => {
      process.env[ENV_JSON] = '512kb';
      expect(json(undefined, undefined)).toBe('512kb');
    });

    it('prefers a handler override over the environment override', () => {
      process.env[ENV_JSON] = '1mb';
      expect(json('10mb', undefined)).toBe(String(10 * 1024 * 1024));
    });

    it('falls back to controller-level metadata when the handler has none', () => {
      expect(json(undefined, '10mb')).toBe(String(10 * 1024 * 1024));
    });

    it('clamps a route override to the 10mb ceiling', () => {
      expect(json('20mb', undefined)).toBe(MAX_BODY_SIZE_LIMIT_CEILING);
    });

    it('accepts a lower per-route limit', () => {
      expect(json('64kb', undefined)).toBe(String(64 * 1024));
    });

    it('ignores an unparseable route override and uses the default', () => {
      expect(json('huge', undefined)).toBe(DEFAULT_JSON_BODY_LIMIT);
    });
  });
});
