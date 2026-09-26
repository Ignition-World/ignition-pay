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
 * - Always has status 'pending'
 * - Marked with isOptimistic: true to distinguish from real entries
 * - Has submittedAt timestamp for cleanup logic
 */
export interface OptimisticTransaction {
  /** Client-generated temp ID — prefixed to distinguish from real IDs */
  optimisticId: string

  /** Status is always pending for optimistic entries */
  status: 'pending'

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
