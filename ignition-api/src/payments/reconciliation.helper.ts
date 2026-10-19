import BigNumber from 'bignumber.js';

/**
 * Reconciliation helper (Issue #415).
 * After a partial payment failure, compares the ledger state against the
 * DB record and flags any discrepancy so it can be investigated.
 */
export interface ReconciliationResult {
  matched: boolean;
  discrepancy?: string;
}

/**
 * Issue #782 — the amounts recorded locally next to the amounts the chain
 * actually charged. Every field is optional so a caller that only knows the
 * status can still use the helper.
 */
export interface ReconciliationAmounts {
  /** Amount the database recorded for the payment. */
  dbAmount?: string;
  /** Amount the on-chain payment operation actually moved. */
  ledgerAmount?: string;
  /** Fee the database recorded as charged. */
  dbFeeCharged?: string;
  /** Fee the on-chain payment operation actually charged. */
  ledgerFeeCharged?: string;
}

/**
 * True when both values are present and differ. Non-numeric input falls back
 * to a plain string comparison rather than comparing NaN.
 */
function differs(recorded?: string, onChain?: string): boolean {
  if (recorded === undefined || onChain === undefined) return false;

  const left = new BigNumber(recorded);
  const right = new BigNumber(onChain);
  if (!left.isFinite() || !right.isFinite()) return recorded !== onChain;

  return !left.eq(right);
}

export function reconcilePayment(
  dbStatus: string,
  ledgerConfirmed: boolean,
  amounts?: ReconciliationAmounts,
): ReconciliationResult {
  if (dbStatus === 'COMPLETED' && !ledgerConfirmed) {
    return { matched: false, discrepancy: 'DB shows COMPLETED but ledger has no confirmation' };
  }
  if (dbStatus === 'FAILED' && ledgerConfirmed) {
    return { matched: false, discrepancy: 'DB shows FAILED but ledger confirms the transaction' };
  }

  // Issue #782 — the amount and the fee charged are reconciled as well. They
  // used to be ignored, so a payment that moved a different amount, or that
  // was charged a different fee than the one recorded, was silently absorbed
  // by the ledger balance and never surfaced as a discrepancy.
  if (amounts) {
    if (differs(amounts.dbAmount, amounts.ledgerAmount)) {
      return {
        matched: false,
        discrepancy:
          `Amount mismatch: DB recorded ${amounts.dbAmount} but the ledger moved ${amounts.ledgerAmount}`,
      };
    }
    if (differs(amounts.dbFeeCharged, amounts.ledgerFeeCharged)) {
      return {
        matched: false,
        discrepancy:
          `Fee mismatch: DB recorded ${amounts.dbFeeCharged} but the ledger charged ${amounts.ledgerFeeCharged}`,
      };
    }
  }

  return { matched: true };
}
