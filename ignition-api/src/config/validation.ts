import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StrKey } from '@stellar/stellar-sdk';
import { CHALLENGE_DELIMITER } from '../auth/auth-home-domain';

/**
 * Runs once on application startup and validates critical env vars.
 *
 * Issue #231 — `STELLAR_HOME_DOMAIN` is required by SEP-10 challenge
 * issuance/verification. The value is embedded into every issued challenge
 * (`<home_domain>:login:<nonce>:<ts>`) so it must:
 *   - be set (default is fine for dev, but validation guards empty strings)
 *   - not contain `:` (the colon is the challenge delimiter — a value
 *     containing colons would silently truncate the home domain on the
 *     client side and break signature replay protection)
 *   - be a stable identifier (we trim and length-check)
 *
 * Session module import order is significant — this service lives in
 * app providers so it runs before any auth controller goes live.
 *
 * Note: `CHALLENGE_DELIMITER` is sourced from `auth-home-domain.ts`
 * (the leaf utility) so the dependency direction stays `config/` →
 * `auth/` — i.e. config/ does not depend on higher-level NestJS
 * components, only on the leaf delimiter constant.
 */
@Injectable()
export class ConfigValidationService implements OnModuleInit {

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.validateAdminWallets();
    this.validateStellarHomeDomain();
    this.validateSecret('JWT_SECRET');
    this.validateSecret('REFRESH_TOKEN_SECRET');
  }

  /**
   * Issue #608 — JWT_SECRET/REFRESH_TOKEN_SECRET previously fell back to
   * hardcoded defaults (`'default-secret'`, `'default-refresh-secret'`,
   * `'stellaraid-default-secret'`) wherever they were read, so a missing
   * env var silently signed tokens with a publicly known key instead of
   * failing. Require both to be set and long enough here, once, so every
   * call site can read them without a fallback.
   */
  private validateSecret(envVar: 'JWT_SECRET' | 'REFRESH_TOKEN_SECRET') {
    const value = this.configService.get<string>(envVar, '');

    if (!value.trim()) {
      throw new Error(
        `${envVar} is not configured. Set it to a random string of at ` +
          `least 64 characters — the server refuses to start with a ` +
          `default/missing secret.`,
      );
    }

    if (value.length < 64) {
      throw new Error(
        `${envVar} must be at least 64 characters (got ${value.length}).`,
      );
    }
  }

  private validateAdminWallets() {
    const adminWalletsStr = this.configService.get<string>('ADMIN_WALLETS', '');
    if (!adminWalletsStr.trim()) {
      return;
    }

    const adminWallets = adminWalletsStr
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);

    for (const wallet of adminWallets) {
      if (!StrKey.isValidEd25519PublicKey(wallet)) {
        throw new Error(
          `Invalid Stellar public key in ADMIN_WALLETS: "${wallet}". ` +
            `Please check your configuration.`,
        );
      }
    }
  }

  /**
   * Issue #231 — assert STELLAR_HOME_DOMAIN is configured before any
   * challenge is issued. Defaults are intentionally narrow so missing
   * config fails noisily in production rather than silently substituting
   * a development value.
   */
  private validateStellarHomeDomain() {
    const configured = this.configService.get<string>(
      'STELLAR_HOME_DOMAIN',
      '',
    );
    const homeDomain = configured.trim();

    if (homeDomain.length === 0) {
      throw new Error(
        'STELLAR_HOME_DOMAIN is not configured. Set it to the Stellar ' +
          'home domain this server represents (use a non-reserved dev value ' +
          'like "ignition-pay.local" for local development).',
      );
    }

    if (homeDomain.includes(CHALLENGE_DELIMITER)) {
      throw new Error(
        `STELLAR_HOME_DOMAIN cannot contain '${CHALLENGE_DELIMITER}' ` +
          `(reserved as the SEP-10 challenge delimiter). Got: "${homeDomain}".`,
      );
    }

    if (homeDomain.length > 60) {
      throw new Error(
        `STELLAR_HOME_DOMAIN is unreasonably long (${homeDomain.length} chars). ` +
          `Stellar home domains are short host-like identifiers.`,
      );
    }
  }
}
