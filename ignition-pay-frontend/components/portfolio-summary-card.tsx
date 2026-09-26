'use client'

import { useState } from 'react'
import { Copy, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MASKED_AMOUNT } from '@/hooks/use-hide-balances'

interface PortfolioSummaryCardProps {
  address: string
  totalValue: number
  change24h: number
  assetCount: number
  updatedAt: string | null
  isRefreshing: boolean
  isLive: boolean
  /** When true, the portfolio value is masked for privacy. */
  hideAmounts?: boolean
  /** Flips the shared privacy preference. */
  onToggleHideAmounts?: () => void
  onRefresh: () => void
}

function formatUpdatedAt(updatedAt: string | null): string {
  if (!updatedAt) return 'never'

  const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000))
  if (elapsedSeconds < 10) return 'just now'
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`

  const minutes = Math.round(elapsedSeconds / 60)
  return minutes === 1 ? '1 min ago' : `${minutes} min ago`
}

/** Aggregate wallet header: address, portfolio value and refresh status. */
export function PortfolioSummaryCard({
  address,
  totalValue,
  change24h,
  assetCount,
  updatedAt,
  isRefreshing,
  isLive,
  hideAmounts = false,
  onToggleHideAmounts,
  onRefresh,
}: PortfolioSummaryCardProps) {
  const [copied, setCopied] = useState(false)
  const showBalance = !hideAmounts

  const copyAddress = () => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const displayAddress = address.slice(0, 4) + '...' + address.slice(-4)
  const isPositive = change24h >= 0

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-card to-card border border-primary/30 p-8 shadow-lg">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full -mr-20 -mt-20" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-primary/5 rounded-full -ml-16 -mb-16" />

      <div className="relative space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Wallet Address</p>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-lg font-mono text-primary">{displayAddress}</code>
              <button
                onClick={copyAddress}
                aria-label="Copy wallet address"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <Copy size={16} />
              </button>
            </div>
            {copied && <p className="text-xs text-primary mt-1">Copied!</p>}
          </div>
          <button
            onClick={onToggleHideAmounts}
            aria-pressed={hideAmounts}
            aria-label={showBalance ? 'Hide portfolio value' : 'Show portfolio value'}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            {showBalance ? <Eye size={20} /> : <EyeOff size={20} />}
          </button>
        </div>

        {/* Total Value */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Value</p>
          <p className="text-4xl font-bold text-primary mt-2">
            {showBalance ? `$${totalValue.toFixed(2)}` : MASKED_AMOUNT}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {assetCount} {assetCount === 1 ? 'asset' : 'assets'} ·{' '}
            <span className={isPositive ? 'text-green-500' : 'text-red-500'}>
              {isPositive ? '+' : ''}
              {change24h.toFixed(2)}%
            </span>{' '}
            today
          </p>
        </div>

        {/* Refresh status */}
        <div className="pt-4 border-t border-border flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {isRefreshing ? 'Refreshing balances…' : `Updated ${formatUpdatedAt(updatedAt)}`}
            {isLive && !isRefreshing && ' · live'}
          </p>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>
    </div>
  )
}
