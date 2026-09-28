'use client'

import { useState, useEffect } from 'react'
import { getPendingTransactions } from './transactionQueue'

export function useTransactionQueueCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const updateCount = async () => {
      try {
        const pending = await getPendingTransactions()
        setCount(pending.length)
      } catch (error) {
        console.error('Error getting queue count:', error)
      }
    }

    updateCount()

    // Update count periodically
    const interval = setInterval(updateCount, 5000)

    // Listen for queue changes
    const handleQueueChange = () => {
      updateCount()
    }

    window.addEventListener('processTransactionQueue', handleQueueChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener('processTransactionQueue', handleQueueChange)
    }
  }, [])

  return count
}
