-- Issue #129: Add Prisma schema validation and migrations for all required models
-- This migration adds missing enums, tables, and columns to align the database
-- schema with the Prisma schema definitions for user, apiKey, campaign, donation,
-- and auditLog models, as well as Transaction, DepositAddress, and PasswordHistory.

-- -----------------------------------------------------------------------
-- New enums
-- -----------------------------------------------------------------------

CREATE TYPE "WalletType" AS ENUM ('CUSTODIAL', 'NON_CUSTODIAL');
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED');
CREATE TYPE "AddressStatus" AS ENUM ('AVAILABLE', 'ALLOCATED', 'RETIRED');

-- -----------------------------------------------------------------------
-- Users: add missing columns
-- -----------------------------------------------------------------------

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "deletedAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "phone"            TEXT,
  ADD COLUMN IF NOT EXISTS "bio"              TEXT,
  ADD COLUMN IF NOT EXISTS "avatarUrl"        TEXT,
  ADD COLUMN IF NOT EXISTS "preferences"      JSONB,
  ADD COLUMN IF NOT EXISTS "socialLinks"      JSONB;

-- walletAddress was NOT NULL in init; make nullable to support email-only accounts
ALTER TABLE "users" ALTER COLUMN "walletAddress" DROP NOT NULL;

-- Index for soft-delete queries
CREATE INDEX IF NOT EXISTS "users_deletedAt_idx" ON "users"("deletedAt");

-- -----------------------------------------------------------------------
-- Wallets: add missing columns
-- -----------------------------------------------------------------------

ALTER TABLE "wallets"
  ADD COLUMN IF NOT EXISTS "balance"     DECIMAL(20,7) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "currency"    TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "walletType"  "WalletType"  NOT NULL DEFAULT 'CUSTODIAL',
  ADD COLUMN IF NOT EXISTS "status"      "WalletStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX IF NOT EXISTS "wallets_status_idx" ON "wallets"("status");

-- -----------------------------------------------------------------------
-- PasswordHistory table
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "password_history" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "password_history_userId_createdAt_idx"
  ON "password_history"("userId", "createdAt");

ALTER TABLE "password_history"
  ADD CONSTRAINT "password_history_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------
-- Transactions table
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "transactions" (
  "id"              TEXT NOT NULL,
  "from_wallet_id"  TEXT NOT NULL,
  "to_wallet_id"    TEXT NOT NULL,
  "amount"          DECIMAL(20,7) NOT NULL,
  "asset_code"      TEXT NOT NULL DEFAULT 'XLM',
  "asset_issuer"    TEXT,
  "status"          "TransactionStatus" NOT NULL DEFAULT 'PENDING',
  "fee_amount"      DECIMAL(20,7) NOT NULL DEFAULT 0,
  "fee_asset_code"  TEXT NOT NULL DEFAULT 'XLM',
  "stellar_tx_hash" TEXT,
  "metadata"        JSONB,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  "status_updated_at" TIMESTAMP(3),
  "created_by"      TEXT,
  "ip_address"      TEXT,
  "user_agent"      TEXT,

  CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "transactions_stellar_tx_hash_key"
  ON "transactions"("stellar_tx_hash");

CREATE INDEX IF NOT EXISTS "transactions_from_wallet_id_idx"   ON "transactions"("from_wallet_id");
CREATE INDEX IF NOT EXISTS "transactions_to_wallet_id_idx"     ON "transactions"("to_wallet_id");
CREATE INDEX IF NOT EXISTS "transactions_status_idx"           ON "transactions"("status");
CREATE INDEX IF NOT EXISTS "transactions_created_at_idx"       ON "transactions"("created_at");
CREATE INDEX IF NOT EXISTS "transactions_stellar_tx_hash_idx"  ON "transactions"("stellar_tx_hash");

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_from_wallet_id_fkey"
  FOREIGN KEY ("from_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_to_wallet_id_fkey"
  FOREIGN KEY ("to_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------
-- DepositAddress table
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "deposit_addresses" (
  "id"          TEXT NOT NULL,
  "address"     TEXT NOT NULL,
  "walletId"    TEXT NOT NULL,
  "network"     "WalletNetwork" NOT NULL DEFAULT 'STELLAR',
  "status"      "AddressStatus" NOT NULL DEFAULT 'ALLOCATED',
  "label"       TEXT,
  "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "deposit_addresses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "deposit_addresses_address_key"
  ON "deposit_addresses"("address");

CREATE INDEX IF NOT EXISTS "deposit_addresses_walletId_idx" ON "deposit_addresses"("walletId");
CREATE INDEX IF NOT EXISTS "deposit_addresses_status_idx"   ON "deposit_addresses"("status");
CREATE INDEX IF NOT EXISTS "deposit_addresses_network_idx"  ON "deposit_addresses"("network");

ALTER TABLE "deposit_addresses"
  ADD CONSTRAINT "deposit_addresses_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
