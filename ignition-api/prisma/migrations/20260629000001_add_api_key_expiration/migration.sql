-- Add expiration and usage tracking fields to api_keys
ALTER TABLE api_keys
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "lastUsedAt" TIMESTAMP(3);

-- Index for finding expired or stale keys
CREATE INDEX idx_api_keys_active_expiresat ON api_keys("isActive", "expiresAt");
