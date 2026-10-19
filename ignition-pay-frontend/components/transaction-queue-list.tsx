'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  QUEUE_CHANGED_EVENT,
  getQueuedTransactions,
  retryQueuedTransaction,
  type QueuedTransaction,
} from '@/lib/transactionQueue'

/**
 * Lists queued payments that are waiting or have failed, showing the last
 * submission error and a retry button for failed ones, so a payment is never
 * left silently "pending".
 */
export function TransactionQueueList() {
  const [items, setItems] = useState<QueuedTransaction[]>([])

  const refresh = useCallback(async () => {
    try {
      const all = await getQueuedTransactions()
      setItems(all.filter((tx) => tx.status !== 'sent').sort((a, b) => a.timestamp - b.timestamp))
    } catch (error) {
      console.error('Error loading transaction queue:', error)
    }
  }, [])

  useEffect(() => {
    void refresh()
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(QUEUE_CHANGED_EVENT, refresh)
  }, [refresh])

  if (items.length === 0) return null

  return (
    <ul aria-label="Queued payments" className="space-y-2 mb-8">
      {items.map((tx) => (
        <li
          key={tx.id}
          className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm"
        >
          <div className="min-w-0">
            <p className="font-medium text-foreground">
              {tx.amount} {tx.assetCode} to {tx.recipientAddress.slice(0, 6)}...
              {tx.recipientAddress.slice(-6)}
            </p>
            {tx.status === 'failed' ? (
              <p role="alert" className="mt-1 flex items-center gap-1 text-destructive">
                <AlertCircle size={14} />
                Failed{tx.lastError ? `: ${tx.lastError}` : ''}
              </p>
            ) : (
              <p className="mt-1 flex items-center gap-1 text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                Pending{tx.retries > 0 ? ` (attempt ${tx.retries + 1})` : ''}
                {tx.lastError ? ` - last error: ${tx.lastError}` : ''}
              </p>
            )}
          </div>
          {tx.status === 'failed' && (
            <Button size="sm" variant="outline" onClick={() => void retryQueuedTransaction(tx.id)}>
              Retry
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
