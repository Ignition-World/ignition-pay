import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, createVerify, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookAlgorithm } from '@prisma/client';

/**
 * Issue #618 — how far a webhook's `Webhook-Timestamp` may drift from our clock
 * before the delivery is rejected. Five minutes is the convention for this
 * style of signing scheme and absorbs ordinary clock skew between the anchor
 * and this API.
 */
export const DEFAULT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

/** Ceiling on the configured tolerance so a bad value cannot widen replay. */
export const MAX_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 900;

export interface WebhookVerificationResult {
  valid: boolean;
  anchorId: string;
  reason?: string;
}

/** Optional request context forwarded by the guard. */
export interface WebhookVerificationContext {
  /** Unix seconds parsed from the `Webhook-Timestamp` header, when present. */
  timestampSeconds?: number;
}

/** Subset of AnchorConfig the rotation grace-period check reads. */
interface RotationAwareConfig {
  previousWebhookSecret?: string | null;
  previousWebhookSecretExpiresAt?: Date | null;
}

/**
 * Sep24WebhookVerificationService
 *
 * Verifies incoming SEP-24 webhook callbacks from anchors using one of:
 *  - HMAC_SHA256   – shared secret (hex or base64) in `Webhook-Signature`
 *  - RSA_SHA256    – RSA-SHA256 signature over "webhookId.rawBody"
 *  - ECDSA_SHA256  – ECDSA-SHA256 signature over "webhookId.rawBody"
 *
 * Signature format expected in the `Webhook-Signature` header:
 *   v1,<base64-encoded-signature>
 *
 * The signed payload is: `<Webhook-Id>.<raw-request-body>`
 *
 * Issue #618 — already-implemented behaviour (kept as-is): per-anchor secrets,
 * HMAC/RSA/ECDSA dispatch and constant-time comparison. What this change adds:
 *  - a `Webhook-Timestamp` freshness check, which bounds how long a captured
 *    delivery stays usable;
 *  - acceptance of the previous secret during a rotation grace period.
 *
 * RESIDUAL RISK: there is no nonce / delivery store, so a delivery captured
 * while valid can still be replayed *inside* the tolerance window. The window
 * bounds that exposure; it does not remove it.
 */
@Injectable()
export class Sep24WebhookVerificationService {
  private readonly logger = new Logger(Sep24WebhookVerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verify a webhook request for a given anchor.
   *
   * @param anchorId    The anchor slug extracted from the URL (e.g. "circle")
   * @param webhookId   Value of the `Webhook-Id` header
   * @param signature   Value of the `Webhook-Signature` header (format: "v1,<base64>")
   * @param rawBody     Raw request body buffer (must be captured before JSON parsing)
   * @param context     Optional `Webhook-Timestamp` for the freshness check
   */
  async verify(
    anchorId: string,
    webhookId: string,
    signature: string,
    rawBody: Buffer,
    context: WebhookVerificationContext = {},
  ): Promise<WebhookVerificationResult> {
    // ── 1. Look up anchor config ──────────────────────────────────────────
    const config = await this.prisma.anchorConfig.findUnique({
      where: { anchorId },
    });

    if (!config || !config.isActive) {
      this.logger.warn(
        `SEP-24 webhook: no active config found for anchor "${anchorId}"`,
      );
      return { valid: false, anchorId, reason: 'Unknown or inactive anchor' };
    }

    // ── 2. Reject stale/future deliveries before doing any crypto work ────
    // The timestamp is deliberately NOT part of the signed payload: anchors
    // sign "<Webhook-Id>.<rawBody>", so this check only bounds an attacker who
    // already holds a captured request.
    if (
      context.timestampSeconds !== undefined &&
      !this.isWithinTolerance(context.timestampSeconds)
    ) {
      this.logger.warn(
        `SEP-24 webhook [${anchorId}]: Webhook-Timestamp ` +
          `${context.timestampSeconds} is outside the ` +
          `${this.getToleranceSeconds()}s tolerance window`,
      );
      return { valid: false, anchorId, reason: 'Timestamp outside tolerance' };
    }

    // ── 3. Parse signature header ─────────────────────────────────────────
    const parsedSig = this.parseSignatureHeader(signature);
    if (!parsedSig) {
      this.logger.warn(
        `SEP-24 webhook [${anchorId}]: malformed Webhook-Signature header`,
      );
      return { valid: false, anchorId, reason: 'Malformed Webhook-Signature header' };
    }

    // ── 4. Build signed payload ───────────────────────────────────────────
    // SEP-24 convention: "<webhookId>.<rawBody>"
    const signedPayload = Buffer.concat([
      Buffer.from(webhookId, 'utf8'),
      Buffer.from('.', 'utf8'),
      rawBody,
    ]);

    // ── 5. Dispatch to algorithm-specific verifier ────────────────────────
    let valid = false;

    try {
      switch (config.algorithm) {
        case WebhookAlgorithm.HMAC_SHA256:
          valid = this.verifyHmac(
            config.webhookSecret,
            signedPayload,
            parsedSig,
            this.previousSecretWithinGracePeriod(config),
          );
          break;
        case WebhookAlgorithm.RSA_SHA256:
          valid = this.verifyAsymmetric('RSA-SHA256', config.webhookPublicKey, signedPayload, parsedSig);
          break;
        case WebhookAlgorithm.ECDSA_SHA256:
          valid = this.verifyAsymmetric('SHA256', config.webhookPublicKey, signedPayload, parsedSig);
          break;
        default:
          this.logger.error(`SEP-24 webhook [${anchorId}]: unsupported algorithm`);
          return { valid: false, anchorId, reason: 'Unsupported algorithm' };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `SEP-24 webhook [${anchorId}]: verification threw an error – ${message}`,
      );
      return { valid: false, anchorId, reason: 'Signature verification error' };
    }

    if (!valid) {
      this.logger.warn(
        `SEP-24 webhook [${anchorId}]: invalid signature for Webhook-Id "${webhookId}"`,
      );
      return { valid: false, anchorId, reason: 'Invalid signature' };
    }

    this.logger.log(
      `SEP-24 webhook [${anchorId}]: signature verified for Webhook-Id "${webhookId}"`,
    );
    return { valid: true, anchorId };
  }

  // ── Issue #618: timestamp tolerance ───────────────────────────────────────

  /**
   * True when `timestampSeconds` sits within ±tolerance of now.
   *
   * The window is symmetric — a delivery stamped far in the future is as
   * suspicious as one stamped in the past, and would otherwise be a cheap way
   * to keep a captured request usable indefinitely.
   */
  private isWithinTolerance(timestampSeconds: number): boolean {
    if (!Number.isFinite(timestampSeconds)) return false;

    const driftSeconds = Math.abs(
      Math.floor(Date.now() / 1000) - timestampSeconds,
    );

    return driftSeconds <= this.getToleranceSeconds();
  }

  /** Configured tolerance in seconds, clamped to a sane maximum. */
  private getToleranceSeconds(): number {
    const configured = Number(
      process.env.SEP24_WEBHOOK_TOLERANCE_SECONDS ??
        DEFAULT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
    );

    if (!Number.isFinite(configured) || configured <= 0) {
      return DEFAULT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS;
    }

    return Math.min(configured, MAX_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS);
  }

  // ── Issue #618: secret rotation grace period ──────────────────────────────

  /**
   * The previous HMAC secret, but only while its grace period is still open.
   *
   * Returns null once the grace period has passed, or when the anchor is not
   * mid-rotation, so the retired secret stops being accepted on schedule. The
   * HMAC comparison below is constant-time for both the current and the
   * previous secret, matching the existing behaviour.
   *
   * Fails closed: until the rotation migration has been applied to a database
   * (and `prisma generate` re-run), both fields are absent and no previous
   * secret is accepted — i.e. only the current secret works.
   */
  private previousSecretWithinGracePeriod(
    config: RotationAwareConfig,
  ): string | null {
    const previousSecret = config.previousWebhookSecret;
    const graceEndsAt = config.previousWebhookSecretExpiresAt;

    if (!previousSecret || !graceEndsAt) return null;

    if (graceEndsAt.getTime() <= Date.now()) {
      this.logger.warn(
        'SEP-24 webhook: previous webhook secret grace period has expired; ' +
          'clearing previousWebhookSecret is a pending operator task',
      );
      return null;
    }

    return previousSecret;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Parse a header value of the form "v1,<base64>" into a Buffer.
   * Returns null if the format is invalid.
   */
  private parseSignatureHeader(header: string): Buffer | null {
    if (!header) return null;
    const parts = header.split(',');
    if (parts.length < 2 || parts[0] !== 'v1') return null;

    const b64 = parts.slice(1).join(',').trim();
    try {
      return Buffer.from(b64, 'base64');
    } catch {
      return null;
    }
  }

  /**
   * Verify an HMAC-SHA256 signature.
   * The secret may be hex- or base64-encoded.
   *
   * @param previousSecret Secret from the rotation grace period, if any. Only
   *        consulted when the current secret does not match, so a rotation
   *        costs one extra HMAC in the worst case.
   */
  private verifyHmac(
    secret: string | null | undefined,
    payload: Buffer,
    expectedSig: Buffer,
    previousSecret?: string | null,
  ): boolean {
    if (!secret && !previousSecret) {
      throw new Error('HMAC secret is not configured for this anchor');
    }

    if (
      secret &&
      this.matchesHmacSecret(secret, payload, expectedSig)
    ) {
      return true;
    }

    return previousSecret
      ? this.matchesHmacSecret(previousSecret, payload, expectedSig)
      : false;
  }

  /**
   * Compute and compare one HMAC in constant time.
   *
   * "Try base64 first; fall back to raw UTF-8 (covers hex strings too)" — the
   * secret is decoded as base64, which is the documented encoding.
   */
  private matchesHmacSecret(
    secret: string,
    payload: Buffer,
    expectedSig: Buffer,
  ): boolean {
    const secretBuf = Buffer.from(secret, 'base64');
    const computed = createHmac('sha256', secretBuf).update(payload).digest();

    if (computed.length !== expectedSig.length) return false;
    return timingSafeEqual(computed, expectedSig);
  }

  /**
   * Verify an RSA-SHA256 or ECDSA-SHA256 signature using a PEM public key.
   */
  private verifyAsymmetric(
    algorithm: string,
    publicKeyPem: string | null | undefined,
    payload: Buffer,
    signature: Buffer,
  ): boolean {
    if (!publicKeyPem) {
      throw new Error('Public key is not configured for this anchor');
    }

    const verifier = createVerify(algorithm);
    verifier.update(payload);
    return verifier.verify(publicKeyPem, signature);
  }

  /**
   * Convenience: throws UnauthorizedException if verification fails.
   * Used directly from the guard.
   */
  async verifyOrThrow(
    anchorId: string,
    webhookId: string,
    signature: string,
    rawBody: Buffer,
    context: WebhookVerificationContext = {},
  ): Promise<void> {
    const result = await this.verify(
      anchorId,
      webhookId,
      signature,
      rawBody,
      context,
    );
    if (!result.valid) {
      throw new UnauthorizedException(result.reason ?? 'Webhook signature invalid');
    }
  }
}
