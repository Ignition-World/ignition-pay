import { ConfigService } from '@nestjs/config';
import { ConfigValidationService } from './validation';
import { CHALLENGE_DELIMITER } from '../auth/auth-home-domain';

/**
 * Tests for the runtime env-var validator that runs on app boot.
 *
 * `validateStellarHomeDomain` is critical for Issue #231 — a missing
 * or malformed STELLAR_HOME_DOMAIN lets AuthChallengeService silently
 * fall back to a placeholder, which would let one environment accept
 * challenges minted by another. The validator must hard-fail in those
 * cases.
 */
describe('ConfigValidationService — STELLAR_HOME_DOMAIN (Issue #231)', () => {
  function makeConfig(values: Record<string, string>): ConfigService {
    return new ConfigService(values);
  }

  function invokeValidator(config: ConfigService): void {
    const service = new ConfigValidationService(config);
    service.onModuleInit();
  }

  it('throws when STELLAR_HOME_DOMAIN is missing', () => {
    const config = makeConfig({});
    expect(() => invokeValidator(config)).toThrow(/STELLAR_HOME_DOMAIN/);
  });

  it('throws when STELLAR_HOME_DOMAIN is whitespace-only', () => {
    const config = makeConfig({ STELLAR_HOME_DOMAIN: '   ' });
    expect(() => invokeValidator(config)).toThrow(/STELLAR_HOME_DOMAIN/);
  });

  it('throws when STELLAR_HOME_DOMAIN contains the ":" challenge delimiter', () => {
    const config = makeConfig({
      STELLAR_HOME_DOMAIN: 'staging:ignition-pay.local',
    });
    expect(() => invokeValidator(config)).toThrow(/cannot contain ':'/);
  });

  it('throws when STELLAR_HOME_DOMAIN is unreasonably long', () => {
    const config = makeConfig({
      STELLAR_HOME_DOMAIN: 'x'.repeat(120),
    });
    expect(() => invokeValidator(config)).toThrow(/unreasonably long/);
  });

  it('accepts a typical dev value', () => {
    const config = makeConfig({
      STELLAR_HOME_DOMAIN: 'ignition-pay.local',
    });
    expect(() => invokeValidator(config)).not.toThrow();
  });

  it('accepts a staging-shaped value distinct from dev', () => {
    const config = makeConfig({
      STELLAR_HOME_DOMAIN: 'staging.ignition-pay.org',
    });
    expect(() => invokeValidator(config)).not.toThrow();
  });

  it('still validates ADMIN_WALLETS in addition to the new check', () => {
    const config = makeConfig({
      STELLAR_HOME_DOMAIN: 'ignition-pay.local',
      ADMIN_WALLETS: 'NOT-A-VALID-STELLAR-PUBLIC-KEY',
    });
    expect(() => invokeValidator(config)).toThrow(/ADMIN_WALLETS/);
  });

  it('exposes the colon as the shared challenge delimiter at the leaf utility', () => {
    // Issue #231 — CHALLENGE_DELIMITER is sourced from the leaf-level
    // `auth-home-domain` module so ConfigValidationService can import it
    // without taking on a circular dependency.
    expect(CHALLENGE_DELIMITER).toBe(':');
  });
});
