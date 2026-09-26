-- Issue #427 — SEP-24 async status tracking (webhook callbacks).
-- callbackToken: opaque secret embedded in the callback URL so the
--   unauthenticated webhook can be attributed to the right transaction.
-- lastCallbackAt: timestamp of the most recent async status update, used
--   to skip the synchronous anchor poll once async tracking is flowing.

ALTER TABLE sep24_transactions
ADD COLUMN "callbackToken" TEXT,
ADD COLUMN "lastCallbackAt" TIMESTAMP(3);

CREATE UNIQUE INDEX idx_sep24_callback_token ON sep24_transactions("callbackToken");
