'use client'

import { useTransactionQueueProcessor } from '@/lib/useTransactionQueueProcessor'

export function TransactionQueueProcessor() {
  useTransactionQueueProcessor()
  return null
}
