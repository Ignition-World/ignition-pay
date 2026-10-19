-- Add unique constraint to prevent more than one active API key per prefix
CREATE UNIQUE INDEX api_keys_prefix_isactive_unique ON api_keys(prefix, isActive) WHERE isActive = true;
