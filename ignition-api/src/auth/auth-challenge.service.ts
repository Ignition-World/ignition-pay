import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import Keyv from 'keyv';
import { buildChallengePrefix, resolveHomeDomain } from './auth-home-domain';

/**
 * Issue #231 — SEP-10 challenge issuance.
 * Issue #225 — TTL refresh before expiry.
 *
 * The issued challenge format is:
 *     `<STELLAR_HOME_DOMAIN>:login:<nonce>:<unix_ts>`
 *
 * The home-domain prefix replaces the previously hardcoded `stellaraid:`
 * literal so staging and prod sign challenges under different identifiers,
 * preventing accidental cross-environment replay. Validation guarantees
 * (no `:` in the home domain, non-empty) live in ConfigValidationService.
 *
 * AuthVerifyController additionally re-checks the prefix at verify time so
 * any token claiming a non-local home domain is rejected before the
 * (expensive) Ed25519 signature verification runs.
 *
 * Challenge refresh (#225): clients may call refreshChallenge() while the
 * current challenge is still live but within the configured refresh window
 * (AUTH_CHALLENGE_REFRESH_WINDOW_MS). This transparently re-issues a new
 * challenge and stores its expiresAt so slow/mobile networks don't get a
 * rejection mid-flow. The old challenge is atomically replaced.
 */

/** Cached value stored alongside every live challenge. */
export interface ChallengeRecord {
  challenge: string;
  /** Unix timestamp (ms) when this challenge expires. */
  expiresAt: number;
}

/** Shape returned to callers of issueChallenge / refreshChallenge. */
export interface ChallengeResult {
  challenge: string;
  /** ISO-8601 string — safe for JSON serialisation over the wire. */
  expiresAt: string;
}

@Injectable()
export class AuthChallengeService {
  private readonly defaultTtlMs = 5 * 60 * 1000; // 5 minutes
  /** Default refresh window: start refreshing when ≤ 60 s remain. */
  private readonly defaultRefreshWindowMs = 60 * 1000;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Keyv,
    private readonly config: ConfigService,
  ) {}

  /**
   * Build the configured home-domain identifier used to scope the
   * challenge. Delegates to the shared `auth-home-domain` resolver so
   * the challenge-issuer and the challenge-verifier stay in lock-step.
   */
  private getHomeDomain(): string {
    return resolveHomeDomain(this.config);
  }

  /**
   * Issue a brand-new challenge for walletAddress, replacing any
   * previously-stored one. Returns the challenge text and its expiry
   * as an ISO-8601 string so clients can schedule a proactive refresh.
   */
  async issueChallenge(walletAddress: string): Promise<ChallengeResult> {
    const nonce = randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);
    // Issue #231: prefix the challenge with the configured home domain
    // instead of the hardcoded `stellaraid:` literal.
    const challenge = `${buildChallengePrefix(this.getHomeDomain())}${nonce}:${timestamp}`;
    const ttlMs = this.getTtlMs();
    const expiresAt = Date.now() + ttlMs;

    const record: ChallengeRecord = { challenge, expiresAt };
    await this.cache.set(this.getCacheKey(walletAddress), record, ttlMs);

    return { challenge, expiresAt: new Date(expiresAt).toISOString() };
  }

  /**
   * Issue #225 — Refresh the challenge for walletAddress before it expires.
   *
   * If the current challenge is still live but within the configured refresh
   * window, a new challenge is minted and the cache entry is atomically
   * replaced. This prevents clients on slow networks from being rejected
   * mid-flow by an expiry they couldn't have anticipated.
   *
   * Behaviour matrix:
   *  - No existing challenge → issues a fresh one (identical to issueChallenge).
   *  - Challenge exists, outside refresh window → returns it unchanged so
   *    callers don't burn the nonce unnecessarily.
   *  - Challenge exists, inside refresh window → mints a new challenge,
   *    replaces the stored record, returns the new one.
   */
  async refreshChallenge(walletAddress: string): Promise<ChallengeResult> {
    const cacheKey = this.getCacheKey(walletAddress);
    const record = await this.cache.get<ChallengeRecord>(cacheKey);

    if (!record) {
      // No live challenge — just issue one fresh.
      return this.issueChallenge(walletAddress);
    }

    const refreshWindowMs = this.getRefreshWindowMs();
    const msRemaining = record.expiresAt - Date.now();

    if (msRemaining > refreshWindowMs) {
      // Still plenty of time — return the existing challenge untouched.
      return {
        challenge: record.challenge,
        expiresAt: new Date(record.expiresAt).toISOString(),
      };
    }

    // Within the refresh window (or already expired) — re-issue transparently.
    return this.issueChallenge(walletAddress);
  }

  async consumeChallenge(
    walletAddress: string,
    challenge: string,
  ): Promise<void> {
    const cacheKey = this.getCacheKey(walletAddress);
    const record = await this.cache.get<ChallengeRecord>(cacheKey);

    // Support both the new ChallengeRecord shape and the legacy plain-string
    // shape so a rolling deploy doesn't break in-flight sessions.
    const storedChallenge =
      record && typeof record === 'object' && 'challenge' in record
        ? record.challenge
        : (record as unknown as string);

    if (!storedChallenge || storedChallenge !== challenge) {
      throw new UnauthorizedException('Challenge expired or already used');
    }

    await this.cache.delete(cacheKey);
  }

  private getCacheKey(walletAddress: string): string {
    return `auth:challenge:${walletAddress}`;
  }

  private getTtlMs(): number {
    const configuredTtl = this.config.get<string>('AUTH_CHALLENGE_TTL_MS');
    const parsedTtl = Number(configuredTtl ?? this.defaultTtlMs);

    return Number.isFinite(parsedTtl) && parsedTtl > 0
      ? parsedTtl
      : this.defaultTtlMs;
  }

  private getRefreshWindowMs(): number {
    const configured = this.config.get<string>(
      'AUTH_CHALLENGE_REFRESH_WINDOW_MS',
    );
    const parsed = Number(configured ?? this.defaultRefreshWindowMs);

    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : this.defaultRefreshWindowMs;
  }
}
