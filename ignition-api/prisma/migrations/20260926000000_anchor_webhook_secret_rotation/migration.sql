-- Issue #618 — SEP-24 webhook secret rotation with an old-key grace period.
--
-- previousWebhookSecret: the retired HMAC secret. While
--   previousWebhookSecretExpiresAt is still in the future,
--   Sep24WebhookVerificationService accepts a signature made with either the
--   current or the previous secret, so an anchor can rotate without dropping
--   deliveries that were signed with the old key. Once the grace period
--   lapses the previous secret stops being accepted automatically.
--
-- Both columns are NULL by default, so existing anchors are unaffected and
-- keep verifying against webhookSecret alone.
--
-- NOTE: this migration has NOT been run or verified — no `prisma migrate dev`,
-- `prisma migrate deploy` or `prisma generate` was executed for it.

ALTER TABLE anchor_configs
ADD COLUMN "previousWebhookSecret" TEXT,
ADD COLUMN "previousWebhookSecretExpiresAt" TIMESTAMP(3);
