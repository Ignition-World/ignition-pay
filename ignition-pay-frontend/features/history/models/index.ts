/**
 * Transaction types and interfaces for the history feature.
 */

/**
 * Backend transaction as returned from the API.
 * Maps to the TransactionDto from the backend (Part 1).
 */
export interface Transaction {
  id: string
  type: 'sent' | 'received'
  asset: string
  amount: number
  recipient: string
  timestamp: Date
  status: 'confirmed' | 'pending' | 'processing' | 'completed' | 'failed' | 'refunded'
  txHash?: string | null
}

/**
 * An optimistic transaction entry — created client-side
 * immediately after submission before backend confirmation.
 * Reconciled with the real entry when backend responds.
 *
 * Key differences from Transaction:
 * - Has optimisticId instead of real backend id
 * - Starts at status 'pending' and moves to 'confirmed' on reconciliation
 * - Marked with isOptimistic: true to distinguish from real entries
 * - Has submittedAt timestamp for cleanup logic
 */
export interface OptimisticTransaction {
  /** Client-generated temp ID — prefixed to distinguish from real IDs */
  optimisticId: string

  /**
   * 'pending' until the submission succeeds, then 'confirmed'.
   *
   * The entry is kept after confirmation rather than deleted, so the badge the
   * user is looking at visibly changes instead of the row disappearing. It is
   * dropped once a real transaction supersedes it — see
   * {@link mergeOptimisticTransactions} — or by the stale sweep.
   */
  status: 'pending' | 'confirmed'

  /** When the submission was confirmed, if it has been. */
  confirmedAt?: number

  /** When the user submitted the transaction */
  submittedAt: number

  /** Transaction data as submitted by user */
  type: 'sent' | 'received'
  asset: string
  amount: number
  recipient: string
  timestamp: Date

  /** Marks this as an optimistic (unconfirmed) entry */
  isOptimistic: true
}

/**
 * Generates a unique optimistic ID for a pending entry.
 * Format: optimistic-{timestamp}-{random}
 */
export function generateOptimisticId(): string {
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Type guard to check if a transaction is optimistic.
 */
export function isOptimisticTransaction(
  tx: Transaction | OptimisticTransaction,
): tx is OptimisticTransaction {
  return 'isOptimistic' in tx && tx.isOptimistic
}

/**
 * True when a fetched transaction is the server's version of an optimistic one.
 *
 * Matched on the fields the client actually knows at submit time. The optimistic
 * entry has no server id, so there is nothing else to join on. The time window
 * keeps a later, identical payment to the same recipient from being mistaken for
 * this one.
 */
function supersedes(real: Transaction, optimistic: OptimisticTransaction): boolean {
  const MATCH_WINDOW_MS = 10 * 60 * 1000

  return (
    real.type === optimistic.type &&
    real.asset === optimistic.asset &&
    real.amount === optimistic.amount &&
    real.recipient === optimistic.recipient &&
    Math.abs(real.timestamp.getTime() - optimistic.submittedAt) < MATCH_WINDOW_MS
  )
}

/**
 * Merges optimistic entries with fetched transactions for display.
 *
 * Optimistic entries sort first because they are the most recent thing the user
 * did. An optimistic entry is dropped once a real transaction covers it, which
 * is what stops a confirmed row appearing twice — once from the client and once
 * from the server.
 *
 * @param real - Transactions fetched from the backend.
 * @param optimistic - Client-side entries awaiting or just past confirmation.
 * @returns Optimistic entries that are still needed, followed by the real list.
 */
export function mergeOptimisticTransactions(
  real: Transaction[],
  optimistic: OptimisticTransaction[],
): Array<Transaction | OptimisticTransaction> {
  const stillNeeded = optimistic.filter(
    (entry) => !real.some((tx) => supersedes(tx, entry)),
  )

  return [...stillNeeded, ...real]
}
