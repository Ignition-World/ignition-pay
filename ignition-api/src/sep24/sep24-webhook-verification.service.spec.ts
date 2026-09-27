import { UnauthorizedException } from '@nestjs/common';
import { createHmac, generateKeyPairSync, createSign } from 'crypto';
import { WebhookAlgorithm } from '@prisma/client';
import { Sep24WebhookVerificationService } from './sep24-webhook-verification.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const RAW_BODY = Buffer.from(JSON.stringify({ transaction: { id: 'tx-123', status: 'completed' } }));
const WEBHOOK_ID = 'wh_01JTEST123456';
const ANCHOR_ID = 'test-anchor';

/** Build the canonical payload that the anchor signs: "<webhookId>.<rawBody>" */
function buildPayload(webhookId: string, rawBody: Buffer): Buffer {
  return Buffer.concat([Buffer.from(webhookId), Buffer.from('.'), rawBody]);
}

/** Generate a "v1,<base64>" header value from a Buffer signature. */
function toHeaderValue(sig: Buffer): string {
  return `v1,${sig.toString('base64')}`;
}

// ── HMAC fixture ──────────────────────────────────────────────────────────────
const HMAC_SECRET_RAW = 'supersecrethmackey';
// The service decodes the secret as base64; so we encode our raw string to base64
const HMAC_SECRET_B64 = Buffer.from(HMAC_SECRET_RAW).toString('base64');

function makeHmacSignature(webhookId: string, rawBody: Buffer): string {
  const payload = buildPayload(webhookId, rawBody);
  const sig = createHmac('sha256', Buffer.from(HMAC_SECRET_B64, 'base64'))
    .update(payload)
    .digest();
  return toHeaderValue(sig);
}

// ── RSA fixture ───────────────────────────────────────────────────────────────
const { privateKey: RSA_PRIV, publicKey: RSA_PUB } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function makeRsaSignature(webhookId: string, rawBody: Buffer): string {
  const payload = buildPayload(webhookId, rawBody);
  const sign = createSign('RSA-SHA256');
  sign.update(payload);
  const sig = sign.sign(RSA_PRIV);
  return toHeaderValue(sig);
}

// ── ECDSA fixture ─────────────────────────────────────────────────────────────
const { privateKey: EC_PRIV, publicKey: EC_PUB } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function makeEcdsaSignature(webhookId: string, rawBody: Buffer): string {
  const payload = buildPayload(webhookId, rawBody);
  const sign = createSign('SHA256');
  sign.update(payload);
  const sig = sign.sign(EC_PRIV);
  return toHeaderValue(sig);
}

// ── Prisma mock builder ───────────────────────────────────────────────────────

function buildPrisma(config: Partial<{
  anchorId: string;
  algorithm: WebhookAlgorithm;
  webhookSecret: string | null;
  webhookPublicKey: string | null;
  previousWebhookSecret: string | null;
  previousWebhookSecretExpiresAt: Date | null;
  isActive: boolean;
}> | null) {
  return {
    anchorConfig: {
      findUnique: jest.fn().mockResolvedValue(
        config === null
          ? null
          : {
              anchorId: ANCHOR_ID,
              name: 'Test Anchor',
              baseUrl: 'https://anchor.example.com',
              algorithm: WebhookAlgorithm.HMAC_SHA256,
              webhookSecret: HMAC_SECRET_B64,
              webhookPublicKey: null,
              previousWebhookSecret: null,
              previousWebhookSecretExpiresAt: null,
              isActive: true,
              ...config,
            },
      ),
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Sep24WebhookVerificationService', () => {
  let service: Sep24WebhookVerificationService;

  // ── HMAC ─────────────────────────────────────────────────────────────────

  describe('HMAC_SHA256', () => {
    beforeEach(() => {
      const prisma = buildPrisma({ algorithm: WebhookAlgorithm.HMAC_SHA256, webhookSecret: HMAC_SECRET_B64 });
      // @ts-ignore – inject mock
      service = new Sep24WebhookVerificationService(prisma);
    });

    it('accepts a valid HMAC signature', async () => {
      const sig = makeHmacSignature(WEBHOOK_ID, RAW_BODY);
      const result = await service.verify(ANCHOR_ID, WEBHOOK_ID, sig, RAW_BODY);
      expect(result.valid).toBe(true);
    });

    it('rejects a tampered body', async () => {
      const sig = makeHmacSignature(WEBHOOK_ID, RAW_BODY);
      const tamperedBody = Buffer.from('{"transaction":{"id":"tx-999"}}');
      const result = await service.verify(ANCHOR_ID, WEBHOOK_ID, sig, tamperedBody);
      expect(result.valid).toBe(false);
    });

    it('rejects a wrong Webhook-Id', async () => {
      const sig = makeHmacSignature('wrong-id', RAW_BODY);
      const result = await service.verify(ANCHOR_ID, WEBHOOK_ID, sig, RAW_BODY);
      expect(result.valid).toBe(false);
    });

    it('rejects a corrupted signature', async () => {
      const result = await service.verify(ANCHOR_ID, WEBHOOK_ID, 'v1,aW52YWxpZA==', RAW_BODY);
      expect(result.valid).toBe(false);
    });

    it('returns invalid when HMAC secret is missing', async () => {
      const prisma = buildPrisma({ algorithm: WebhookAlgorithm.HMAC_SHA256, webhookSecret: null });
      // @ts-ignore
      service = new Sep24WebhookVerificationService(prisma);
      const sig = makeHmacSignature(WEBHOOK_ID, RAW_BODY);
      const result = await service.verify(ANCHOR_ID, WEBHOOK_ID, sig, RAW_BODY);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/error/i);
    });
  });

  // ── RSA ──────────────────────────────────────────────────────────────────

  describe('RSA_SHA256', () => {
    beforeEach(() => {
      const prisma = buildPrisma({
        algorithm: WebhookAlgorithm.RSA_SHA256,
        webhookSecret: null,
        webhookPublicKey: RSA_PUB as string,
      });
      // @ts-ignore
      service = new Sep24WebhookVerificationService(prisma);
    });

    it('accepts a valid RSA signature', async () => {
      const sig = makeRsaSignature(WEBHOOK_ID, RAW_BODY);
      const result = await service.verify(ANCHOR_ID, WEBHOOK_ID, sig, RAW_BODY);
      expect(result.valid).toBe(true);
    });

    it('rejects a tampered body', async () => {
      const sig = makeRsaSignature(WEBHOOK_ID, RAW_BODY);
      const tampered = Buffer.from('tampered');
      const result = await service.verify(ANCHOR_ID, WEBHOOK_ID, sig, tampered);
      expect(result.valid).toBe(false);
    });

    it('rejects an ECDSA signature with an RSA key', async () => {
      const sig = makeEcdsaSignature(WEBHOOK_ID, RAW_BODY);
      const result = await service.verify(ANCHOR_ID, WEBHOOK_ID, sig, RAW_BODY);
      expect(result.valid).toBe(false);
    });

    it('returns invalid when public key is missing', async () => {
      const prisma = buildPrisma({
        algorithm: WebhookAlgorithm.RSA_SHA256,
        webhookPublicKey: null,
      });
      // @ts-ignore
      service = new Sep24WebhookVerificationService(prisma);
      const sig = makeRsaSignature(WEBHOOK_ID, RAW_BODY);
      const result = await service.verify(ANCHOR_ID, WEBHOOK_ID, sig, RAW_BODY);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/error/i);
    });
  });

  // ── ECDSA ─────────────────────────────────────────────────────────────────

  describe('ECDSA_SHA256', () => {
    beforeEach(() => {
      const prisma = buildPrisma({
        algorithm: WebhookAlgorithm.ECDSA_SHA256,
        webhookSecret: null,
        webhookPublicKey: EC_PUB as string,
      });
      // @ts-ignore
      service = new Sep24WebhookVerificationService(prisma);
    });

    it('accepts a valid ECDSA signature', async () => {
      const sig = makeEcdsaSignature(WEBHOOK_ID, RAW_BODY);
      const result = await service.verify(ANCHOR_ID, WEBHOOK_ID, sig, RAW_BODY);
      expect(result.valid).toBe(true);
    });

    it('rejects a tampered body', async () => {
      const sig = makeEcdsaSignature(WEBHOOK_ID, RAW_BODY);
      const tampered = Buffer.from('tampered');
      const result = await service.verify(ANCHOR_ID, WEBHOOK_ID, sig, tampered);
      expect(result.valid).toBe(false);
    });
  });

  // ── Header parsing ────────────────────────────────────────────────────────

  describe('signature header validation', () => {
    beforeEach(() => {
      const prisma = buildPrisma({ algorithm: WebhookAlgorithm.HMAC_SHA256, webhookSecret: HMAC_SECRET_B64 });
      // @ts-ignore
      service = new Sep24WebhookVerificationService(prisma);
    });

    it('rejects a missing signature header', async () => {
      const result = await service.verify(ANCHOR_ID, WEBHOOK_ID, '', RAW_BODY);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/malformed/i);
    });

    it('rejects a header without the "v1," prefix', async () => {
      const sig = createHmac('sha256', Buffer.from(HMAC_SECRET_B64, 'base64'))
        .update(buildPayload(WEBHOOK_ID, RAW_BODY))
        .digest('base64');
      const result = await service.verify(ANCHOR_ID, WEBHOOK_ID, sig, RAW_BODY);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/malformed/i);
    });
  });

  // ── Anchor config resolution ──────────────────────────────────────────────

  describe('anchor config lookup', () => {
    it('returns invalid for an unknown anchor', async () => {
      const prisma = buildPrisma(null);
      // @ts-ignore
      service = new Sep24WebhookVerificationService(prisma);
      const sig = makeHmacSignature(WEBHOOK_ID, RAW_BODY);
      const result = await service.verify('unknown-anchor', WEBHOOK_ID, sig, RAW_BODY);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/unknown|inactive/i);
    });

    it('returns invalid for an inactive anchor', async () => {
      const prisma = buildPrisma({ isActive: false });
      // @ts-ignore
      service = new Sep24WebhookVerificationService(prisma);
      const sig = makeHmacSignature(WEBHOOK_ID, RAW_BODY);
      const result = await service.verify(ANCHOR_ID, WEBHOOK_ID, sig, RAW_BODY);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/unknown|inactive/i);
    });
  });

  // ── verifyOrThrow ─────────────────────────────────────────────────────────

  describe('verifyOrThrow', () => {
    beforeEach(() => {
      const prisma = buildPrisma({ algorithm: WebhookAlgorithm.HMAC_SHA256, webhookSecret: HMAC_SECRET_B64 });
      // @ts-ignore
      service = new Sep24WebhookVerificationService(prisma);
    });

    it('resolves without throwing on a valid signature', async () => {
      const sig = makeHmacSignature(WEBHOOK_ID, RAW_BODY);
      await expect(
        service.verifyOrThrow(ANCHOR_ID, WEBHOOK_ID, sig, RAW_BODY),
      ).resolves.toBeUndefined();
    });

    it('throws UnauthorizedException on an invalid signature', async () => {
      await expect(
        service.verifyOrThrow(ANCHOR_ID, WEBHOOK_ID, 'v1,aW52YWxpZA==', RAW_BODY),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on a stale timestamp', async () => {
      const sig = makeHmacSignature(WEBHOOK_ID, RAW_BODY);
      const stale = Math.floor(Date.now() / 1000) - 3600;

      await expect(
        service.verifyOrThrow(ANCHOR_ID, WEBHOOK_ID, sig, RAW_BODY, {
          timestampSeconds: stale,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── Issue #618: timestamp tolerance ────────────────────────────────────

  describe('Webhook-Timestamp tolerance', () => {
    const now = () => Math.floor(Date.now() / 1000);
    const at = (timestampSeconds: number) => ({ timestampSeconds });

    beforeEach(() => {
      const prisma = buildPrisma({
        algorithm: WebhookAlgorithm.HMAC_SHA256,
        webhookSecret: HMAC_SECRET_B64,
      });
      // @ts-ignore – inject mock
      service = new Sep24WebhookVerificationService(prisma);
    });

    it('accepts a timestamp within the 5 minute window', async () => {
      const sig = makeHmacSignature(WEBHOOK_ID, RAW_BODY);
      const result = await service.verify(
        ANCHOR_ID,
        WEBHOOK_ID,
        sig,
        RAW_BODY,
        at(now() - 60),
      );
      expect(result.valid).toBe(true);
    });

    it('accepts a timestamp slightly in the future (clock skew)', async () => {
      const sig = makeHmacSignature(WEBHOOK_ID, RAW_BODY);
      const result = await service.verify(
        ANCHOR_ID,
        WEBHOOK_ID,
        sig,
        RAW_BODY,
        at(now() + 60),
      );
      expect(result.valid).toBe(true);
    });

    it('rejects a stale timestamp even when the signature is valid', async () => {
      const sig = makeHmacSignature(WEBHOOK_ID, RAW_BODY);
      const result = await service.verify(
        ANCHOR_ID,
        WEBHOOK_ID,
        sig,
        RAW_BODY,
        at(now() - 301),
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/timestamp/i);
    });

    it('rejects a far-future timestamp', async () => {
      const sig = makeHmacSignature(WEBHOOK_ID, RAW_BODY);
      const result = await service.verify(
        ANCHOR_ID,
        WEBHOOK_ID,
        sig,
        RAW_BODY,
        at(now() + 86_400),
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/timestamp/i);
    });

    it('rejects a non-finite timestamp rather than treating it as "now"', async () => {
      const sig = makeHmacSignature(WEBHOOK_ID, RAW_BODY);
      const result = await service.verify(
        ANCHOR_ID,
        WEBHOOK_ID,
        sig,
        RAW_BODY,
        at(Number.NaN),
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/timestamp/i);
    });

    it('still accepts a request from an anchor that sends no timestamp', async () => {
      const sig = makeHmacSignature(WEBHOOK_ID, RAW_BODY);
      const result = await service.verify(ANCHOR_ID, WEBHOOK_ID, sig, RAW_BODY);
      expect(result.valid).toBe(true);
    });

    it('honours a narrowed SEP24_WEBHOOK_TOLERANCE_SECONDS', async () => {
      const previous = process.env.SEP24_WEBHOOK_TOLERANCE_SECONDS;
      process.env.SEP24_WEBHOOK_TOLERANCE_SECONDS = '10';
      try {
        const sig = makeHmacSignature(WEBHOOK_ID, RAW_BODY);
        const result = await service.verify(
          ANCHOR_ID,
          WEBHOOK_ID,
          sig,
          RAW_BODY,
          at(now() - 60),
        );
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/timestamp/i);
      } finally {
        if (previous === undefined) {
          delete process.env.SEP24_WEBHOOK_TOLERANCE_SECONDS;
        } else {
          process.env.SEP24_WEBHOOK_TOLERANCE_SECONDS = previous;
        }
      }
    });
  });

  // ── Issue #618: secret rotation grace period ───────────────────────────

  describe('HMAC secret rotation', () => {
    const OLD_SECRET_RAW = 'oldsecretrotatedaway';
    const OLD_SECRET_B64 = Buffer.from(OLD_SECRET_RAW).toString('base64');

    function makeOldSecretSignature(
      webhookId: string,
      rawBody: Buffer,
    ): string {
      const sig = createHmac('sha256', Buffer.from(OLD_SECRET_B64, 'base64'))
        .update(buildPayload(webhookId, rawBody))
        .digest();
      return toHeaderValue(sig);
    }

    it('accepts a signature from the previous secret inside the grace period', async () => {
      const prisma = buildPrisma({
        algorithm: WebhookAlgorithm.HMAC_SHA256,
        webhookSecret: HMAC_SECRET_B64,
        previousWebhookSecret: OLD_SECRET_B64,
        previousWebhookSecretExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      // @ts-ignore
      service = new Sep24WebhookVerificationService(prisma);

      const result = await service.verify(
        ANCHOR_ID,
        WEBHOOK_ID,
        makeOldSecretSignature(WEBHOOK_ID, RAW_BODY),
        RAW_BODY,
      );
      expect(result.valid).toBe(true);
    });

    it('still accepts the current secret while a rotation is in flight', async () => {
      const prisma = buildPrisma({
        algorithm: WebhookAlgorithm.HMAC_SHA256,
        webhookSecret: HMAC_SECRET_B64,
        previousWebhookSecret: OLD_SECRET_B64,
        previousWebhookSecretExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      // @ts-ignore
      service = new Sep24WebhookVerificationService(prisma);

      const result = await service.verify(
        ANCHOR_ID,
        WEBHOOK_ID,
        makeHmacSignature(WEBHOOK_ID, RAW_BODY),
        RAW_BODY,
      );
      expect(result.valid).toBe(true);
    });

    it('rejects the previous secret once the grace period has expired', async () => {
      const prisma = buildPrisma({
        algorithm: WebhookAlgorithm.HMAC_SHA256,
        webhookSecret: HMAC_SECRET_B64,
        previousWebhookSecret: OLD_SECRET_B64,
        previousWebhookSecretExpiresAt: new Date(Date.now() - 1000),
      });
      // @ts-ignore
      service = new Sep24WebhookVerificationService(prisma);

      const result = await service.verify(
        ANCHOR_ID,
        WEBHOOK_ID,
        makeOldSecretSignature(WEBHOOK_ID, RAW_BODY),
        RAW_BODY,
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/invalid signature/i);
    });

    it('rejects the previous secret when no expiry was configured', async () => {
      const prisma = buildPrisma({
        algorithm: WebhookAlgorithm.HMAC_SHA256,
        webhookSecret: HMAC_SECRET_B64,
        previousWebhookSecret: OLD_SECRET_B64,
        previousWebhookSecretExpiresAt: null,
      });
      // @ts-ignore
      service = new Sep24WebhookVerificationService(prisma);

      const result = await service.verify(
        ANCHOR_ID,
        WEBHOOK_ID,
        makeOldSecretSignature(WEBHOOK_ID, RAW_BODY),
        RAW_BODY,
      );
      expect(result.valid).toBe(false);
    });

    it('rejects an unrelated secret during the grace period', async () => {
      const prisma = buildPrisma({
        algorithm: WebhookAlgorithm.HMAC_SHA256,
        webhookSecret: HMAC_SECRET_B64,
        previousWebhookSecret: OLD_SECRET_B64,
        previousWebhookSecretExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      // @ts-ignore
      service = new Sep24WebhookVerificationService(prisma);

      const result = await service.verify(
        ANCHOR_ID,
        WEBHOOK_ID,
        'v1,aW52YWxpZA==',
        RAW_BODY,
      );
      expect(result.valid).toBe(false);
    });
  });
});
