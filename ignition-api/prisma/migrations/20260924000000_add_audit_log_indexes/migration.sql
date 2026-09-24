-- Issue #589 — Ensure AuditLog indexes exist (idempotent)
-- Aligns database indexes with Prisma schema @@index definitions for audit_logs.
-- Safe on fresh DBs (creates indexes) and existing DBs (IF NOT EXISTS).

-- Single-column indexes (schema @@index)
CREATE INDEX IF NOT EXISTS "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX IF NOT EXISTS "audit_logs_resourceType_idx" ON "audit_logs"("resourceType");
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- Compound indexes for common audit log queries:
--   filter by user + action ordered by time; look up by resource type + id
CREATE INDEX IF NOT EXISTS "audit_logs_userId_action_createdAt_idx"
  ON "audit_logs"("userId", "action", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_resourceType_resourceId_idx"
  ON "audit_logs"("resourceType", "resourceId");

-- Legacy names from 20250626000000_add_performance_indexes (compat if that migration ran)
CREATE INDEX IF NOT EXISTS "idx_auditlogs_user_action_createdat"
  ON "audit_logs"("userId", "action", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_auditlogs_resource_type_id"
  ON "audit_logs"("resourceType", "resourceId");
