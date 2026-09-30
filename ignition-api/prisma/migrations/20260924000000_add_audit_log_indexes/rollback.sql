-- Rollback for 20260924000000_add_audit_log_indexes (Issue #589)
-- Drop compound AuditLog indexes introduced/ensured by this migration.
-- Keeps single-column indexes from 0000_init unless you intentionally drop them below.

DROP INDEX IF EXISTS "audit_logs_userId_action_createdAt_idx";
DROP INDEX IF EXISTS "audit_logs_resourceType_resourceId_idx";

-- Optional: only drop single-column indexes if rolling back a DB that never had 0000_init indexes
-- DROP INDEX IF EXISTS "audit_logs_userId_idx";
-- DROP INDEX IF EXISTS "audit_logs_action_idx";
-- DROP INDEX IF EXISTS "audit_logs_resourceType_idx";
-- DROP INDEX IF EXISTS "audit_logs_createdAt_idx";
