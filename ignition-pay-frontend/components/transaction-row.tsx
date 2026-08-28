'use client'

import {
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import type { Transaction, OptimisticTransaction } from '@/features/history/models'
import { isOptimisticTransaction } from '@/features/history/models'
// The row now navigates to a dedicated transaction detail page instead of opening an inline sheet.
import { useTranslation } from '@/lib/i18n'

interface TransactionRowProps {
  transaction: Transaction | OptimisticTransaction
}

/**
 * Status badge component that handles both real and optimistic transactions.
 * Optimistic transactions show a loading spinner to indicate pending confirmation.
 * Pairs colors with distinct status icons and clear text labels for accessibility.
 */
function TransactionStatusBadge({
  transaction,
}: {
  transaction: Transaction | OptimisticTransaction
}) {
  const { t } = useTranslation()
  const isOptimistic = isOptimisticTransaction(transaction)

  if (isOptimistic) {
    return (
      <span
        className="text-xs px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-500 inline-flex items-center gap-1 font-medium"
        aria-label={t('transactionRow.pendingConfirmation')}
        aria-live="polite"
      >
        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
        {t('common.pending')}...
      </span>
    )
  }

  const statusColors: Record<Transaction['status'], string> = {
    pending: 'bg-yellow-500/20 text-yellow-500',
    processing: 'bg-blue-500/20 text-blue-500',
    completed: 'bg-green-500/20 text-green-500',
    failed: 'bg-red-500/20 text-red-500',
    refunded: 'bg-purple-500/20 text-purple-500',
    confirmed: 'bg-green-500/20 text-green-500',
  }

  const statusIcons: Record<Transaction['status'], React.ReactNode> = {
    pending: <Clock size={12} aria-hidden="true" />,
    processing: <RefreshCw size={12} className="animate-spin" aria-hidden="true" />,
    completed: <CheckCircle2 size={12} aria-hidden="true" />,
    failed: <XCircle size={12} aria-hidden="true" />,
    refunded: <RotateCcw size={12} aria-hidden="true" />,
    confirmed: <CheckCircle2 size={12} aria-hidden="true" />,
  }

  const statusLabel: Record<Transaction['status'], string> = {
    pending: t('common.pending'),
    processing: t('common.processing'),
    completed: t('common.completed'),
    failed: t('common.failed'),
    refunded: t('common.refunded'),
    confirmed: t('common.confirmed'),
  }

  return (
    <span
      className={`text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 font-medium ${
        statusColors[transaction.status]
      }`}
      aria-label={`Status: ${statusLabel[transaction.status]}`}
    >
      {statusIcons[transaction.status]}
      <span>{statusLabel[transaction.status]}</span>
    </span>
  )
}

interface TransactionRowProps {
  transaction: Transaction | OptimisticTransaction
}

export function TransactionRow({ transaction }: TransactionRowProps) {
  const { t } = useTranslation()
  const { type, asset, amount, recipient, timestamp, status } = transaction
  const displayRecipient = recipient.slice(0, 6) + '...' + recipient.slice(-4)
  const isSent = type === 'sent'

  const formattedDate = timestamp.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const isOptimistic = isOptimisticTransaction(transaction)

  // Determine standard fee
  const networkFee = '0.00001 XLM'
  const explorerLink = transaction.txHash
    ? `https://stellar.expert/explorer/public/tx/${transaction.txHash}`
    : '#'

  return (
    <Link
      href={`/transactions/${transaction.id}`}
      className={`flex items-center justify-between py-4 px-4 rounded-lg transition-colors border ${
        isOptimistic
          ? 'bg-yellow-500/5 border-yellow-500/30 hover:bg-yellow-500/10'
          : 'border-transparent hover:bg-muted/50 hover:border-border'
      }`}
    >
      <div className="flex items-center gap-4 flex-1">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center ${
            isSent ? 'bg-red-500/20' : 'bg-green-500/20'
          } ${isOptimistic ? 'opacity-60' : ''}`}
        >
          {isSent ? (
            <ArrowUpRight size={20} className="text-red-500" aria-label="Sent icon" />
          ) : (
            <ArrowDownLeft size={20} className="text-green-500" aria-label="Received icon" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold ${isOptimistic ? 'text-muted-foreground' : 'text-foreground'}`}>
            {isSent ? t('transactionRow.sent') : t('transactionRow.received')} {asset}
          </p>
          <p className="text-sm text-muted-foreground truncate">{displayRecipient}</p>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        <p className={`font-semibold ${isSent ? 'text-red-500' : 'text-green-500'} ${isOptimistic ? 'opacity-70' : ''}`}>
          {isSent ? '-' : '+'}
          {amount.toFixed(4)} {asset}
        </p>
        <p className="text-xs text-muted-foreground">{formattedDate}</p>
        <TransactionStatusBadge transaction={transaction} />
      </div>
    </Link>
  )
}
