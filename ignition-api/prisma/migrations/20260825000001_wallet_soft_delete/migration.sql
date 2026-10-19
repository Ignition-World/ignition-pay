-- Issue #424 — Add soft-delete support on wallets table to preserve transaction history
ALTER TABLE wallets
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX idx_wallets_deleted_at ON wallets("deletedAt");
CREATE INDEX idx_wallets_id_deleted_at ON wallets("id", "deletedAt");
CREATE INDEX idx_wallets_user_id_deleted_at ON wallets("userId", "deletedAt");
CREATE INDEX idx_wallets_id_is_active_deleted_at ON wallets("id", "isActive", "deletedAt");
