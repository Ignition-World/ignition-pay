-- Add rotation support fields to api_keys for zero-downtime key rotation
-- rotationOfId: references the old key that is being rotated
-- rotationExpiresAt: when the rotation grace period ends; old key auto-revokes after this

ALTER TABLE api_keys
ADD COLUMN "rotationOfId" TEXT,
ADD COLUMN "rotationExpiresAt" TIMESTAMP(3);

-- Drop the old unique constraint on (prefix, isActive) since we now allow
-- both old and new keys to be active during the rotation grace period
DROP INDEX IF EXISTS api_keys_prefix_isActive_key;
DROP INDEX IF EXISTS idx_api_keys_prefix_isactive;

-- Index for finding keys in rotation grace period
CREATE INDEX idx_api_keys_rotation_expiresat ON api_keys("isActive", "rotationExpiresAt");

-- Index for looking up keys by rotationOfId
CREATE INDEX idx_api_keys_rotation_of_id ON api_keys("rotationOfId");