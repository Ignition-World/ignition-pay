'use client'

import { useEffect, useCallback } from 'react'
import { useToast } from '@/components/ui/toast'
import { API_BASE_URLS, API_PREFIX } from '@/lib/constants/api'
import {
  getPendingTransactions,
  updateQueuedTransaction,
  removeQueuedTransaction,
  type QueuedTransaction,
} from './transactionQueue'

const MAX_RETRIES = 3
const RETRY_DELAY = 5000 // 5 seconds

export function useTransactionQueueProcessor() {
  const toast = useToast()

  const processTransaction = useCallback(async (transaction: QueuedTransaction) => {
    try {
      const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || API_BASE_URLS.development).replace(/\/$/, '')
      const response = await fetch(baseUrl + API_PREFIX + '/payments/' + transaction.senderWalletId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          senderWalletId: transaction.senderWalletId,
          recipientAddress: transaction.recipientAddress,
          amount: transaction.amount,
          assetCode: transaction.assetCode,
        }),
      })

      if (!response.ok) {
        throw new Error(`Payment submission failed (${response.status})`)
      }

      // Success - remove from queue
      await removeQueuedTransaction(transaction.id)
      toast.add({
        title: 'Payment sent',
        description: `Your ${transaction.amount} ${transaction.assetCode} payment was successfully sent.`,
        type: 'success',
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      if (transaction.retries >= MAX_RETRIES) {
        // Max retries reached - mark as failed
        await updateQueuedTransaction({
          ...transaction,
          status: 'failed',
          lastError: errorMessage,
        })
        
        toast.add({
          title: 'Payment failed',
          description: `Could not send ${transaction.amount} ${transaction.assetCode}. ${errorMessage}`,
          type: 'error',
        })
      } else {
        // Increment retry count and update
        await updateQueuedTransaction({
          ...transaction,
          retries: transaction.retries + 1,
          lastError: errorMessage,
        })
        
        // Schedule retry with exponential backoff
        const delay = RETRY_DELAY * Math.pow(2, transaction.retries)
        setTimeout(() => processQueue(), delay)
      }
    }
  }, [toast])

  const processQueue = useCallback(async () => {
    try {
      const pendingTransactions = await getPendingTransactions()
      
      for (const transaction of pendingTransactions) {
        await processTransaction(transaction)
      }
    } catch (error) {
      console.error('Error processing transaction queue:', error)
    }
  }, [processTransaction])

  useEffect(() => {
    // Listen for queue processing events
    const handleProcessQueue = () => {
      processQueue()
    }

    window.addEventListener('processTransactionQueue', handleProcessQueue)

    // Process queue on mount
    if (navigator.onLine) {
      processQueue()
    }

    return () => {
      window.removeEventListener('processTransactionQueue', handleProcessQueue)
    }
  }, [processQueue])

  return { processQueue }
}
