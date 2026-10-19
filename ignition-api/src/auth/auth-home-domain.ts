import { ConfigService } from '@nestjs/config';

/**
 * Issue #231 — single source of truth for the SEP-10 home-domain
 * identifier and its reserved delimiter.
 *
 * Both AuthChallengeService and AuthVerifyController must use the SAME
 * resolver (and therefore the SAME fallback semantics) — otherwise a
 * subtle drift in the fallback string could let a malformed challenge
 * slip through the prefix check.
 *
 * Architectural note: this is a **leaf** utility. It depends only on
 * `@nestjs/config`. ConfigValidationService and the auth controllers
 * both depend on this file, but not the reverse — keeping the dependency
 * direction one-way (`config/` → `auth/`) prevents accidental
 * boot-time/runtime tangles.
 */

/**
 * The colon is RESERVED as the SEP-10 challenge delimiter. Challenge
 * format is `<home_domain>${CHALLENGE_DELIMITER}login${CHALLENGE_DELIMITER}<nonce>${CHALLENGE_DELIMITER}<ts>`.
 * Exported here as a leaf-level constant so ConfigValidationService can
 * import it for its startup check.
 */
export const CHALLENGE_DELIMITER = ':';

/**
 * Read STELLAR_HOME_DOMAIN from config with one consistent fallback path.
 *
 * Production should have ConfigValidationService hard-fail if the value
 * is empty or contains `:`; this resolver returns the literal
 * `'ignition-pay.local'` only for the local dev convenience path so
 * missing config is obvious in logs.
 */
export function resolveHomeDomain(config: ConfigService): string {
  return (
    config.get<string>('STELLAR_HOME_DOMAIN', '').trim() ||
    'ignition-pay.local'
  );
}

/**
 * Build the expected challenge prefix for a given home domain. Exported
 * for spec convenience and to keep the two call sites in lock-step.
 *
 * Note: deliberately does NOT validate the home-domain contents — that
 * is the responsibility of ConfigValidationService at startup.
 */
export function buildChallengePrefix(homeDomain: string): string {
  return `${homeDomain}${CHALLENGE_DELIMITER}login${CHALLENGE_DELIMITER}`;
}
