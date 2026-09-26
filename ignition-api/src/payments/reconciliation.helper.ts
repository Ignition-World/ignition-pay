/**
 * Reconciliation helper (Issue #415).
 * After a partial payment failure, compares the ledger state against the
 * DB record and flags any discrepancy so it can be investigated.
 */
export interface ReconciliationResult {
  matched: boolean;
  discrepancy?: string;
}

export function reconcilePayment(
  dbStatus: string,
  ledgerConfirmed: boolean,
): ReconciliationResult {
  if (dbStatus === 'COMPLETED' && !ledgerConfirmed) {
    return { matched: false, discrepancy: 'DB shows COMPLETED but ledger has no confirmation' };
  }
  if (dbStatus === 'FAILED' && ledgerConfirmed) {
    return { matched: false, discrepancy: 'DB shows FAILED but ledger confirms the transaction' };
  }
  return { matched: true };
}