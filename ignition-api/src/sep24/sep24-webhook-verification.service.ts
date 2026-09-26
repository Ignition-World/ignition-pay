import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, createVerify, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookAlgorithm } from '@prisma/client';

export interface WebhookVerificationResult {
  valid: boolean;
  anchorId: string;
  reason?: string;
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
   */
  async verify(
    anchorId: string,
    webhookId: string,
    signature: string,
    rawBody: Buffer,
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

    // ── 2. Parse signature header ─────────────────────────────────────────
    const parsedSig = this.parseSignatureHeader(signature);
    if (!parsedSig) {
      this.logger.warn(
        `SEP-24 webhook [${anchorId}]: malformed Webhook-Signature header`,
      );
      return { valid: false, anchorId, reason: 'Malformed Webhook-Signature header' };
    }

    // ── 3. Build signed payload ───────────────────────────────────────────
    // SEP-24 convention: "<webhookId>.<rawBody>"
    const signedPayload = Buffer.concat([
      Buffer.from(webhookId, 'utf8'),
      Buffer.from('.', 'utf8'),
      rawBody,
    ]);

    // ── 4. Dispatch to algorithm-specific verifier ────────────────────────
    let valid = false;

    try {
      switch (config.algorithm) {
        case WebhookAlgorithm.HMAC_SHA256:
          valid = this.verifyHmac(config.webhookSecret, signedPayload, parsedSig);
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
   */
  private verifyHmac(
    secret: string | null | undefined,
    payload: Buffer,
    expectedSig: Buffer,
  ): boolean {
    if (!secret) {
      throw new Error('HMAC secret is not configured for this anchor');
    }

    // Try base64 first; fall back to raw UTF-8 (covers hex strings too)
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
  ): Promise<void> {
    const result = await this.verify(anchorId, webhookId, signature, rawBody);
    if (!result.valid) {
      throw new UnauthorizedException(result.reason ?? 'Webhook signature invalid');
    }
  }
}
