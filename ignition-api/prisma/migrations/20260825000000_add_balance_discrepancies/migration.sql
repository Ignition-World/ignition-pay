-- Issue #447 — Add balance_discrepancies table for idempotent reconciliation
-- Track wallet balance drift between DB and on-chain Horizon balances

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "balance_discrepancies" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "stellarAddress" TEXT NOT NULL,
    "dbBalance" DECIMAL(18,7) NOT NULL,
    "onChainBalance" DECIMAL(18,7) NOT NULL,
    "driftAmount" DECIMAL(18,7) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "balance_discrepancies_walletId_idx" ON "balance_discrepancies"("walletId");

-- CreateIndex
CREATE INDEX "balance_discrepancies_status_idx" ON "balance_discrepancies"("status");

-- CreateIndex
CREATE INDEX "balance_discrepancies_createdAt_idx" ON "balance_discrepancies"("createdAt");
