'use client'

import { Badge } from '@/components/ui/badge'
import { MASKED_AMOUNT } from '@/hooks/use-hide-balances'

interface AssetCardProps {
  code: string
  issuer: string
  balance: number
  value: number
  change24h?: number
  /** When true, amounts are masked for privacy. */
  hideAmounts?: boolean
}

export function AssetCard({
  code,
  issuer,
  balance,
  value,
  change24h,
  hideAmounts = false,
}: AssetCardProps) {
  const displayIssuer = issuer.slice(0, 6) + '...' + issuer.slice(-4)
  const isPositive = (change24h ?? 0) >= 0

  return (
    <div className="rounded-xl bg-card border border-border p-4 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">{code[0]}</span>
            </div>
            <div>
              <p className="font-semibold text-foreground">{code}</p>
              <p className="text-xs text-muted-foreground">{displayIssuer}</p>
            </div>
          </div>
        </div>
        {change24h !== undefined && (
          <Badge
            variant={isPositive ? 'success' : 'destructive'}
            className="text-sm font-semibold border-transparent bg-transparent px-0 py-0"
            aria-label={`24 hour change ${isPositive ? 'up' : 'down'} ${Math.abs(change24h).toFixed(2)} percent`}
          >
            {isPositive ? '+' : ''}
            {change24h.toFixed(2)}%
          </Badge>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Balance</p>
          <p className="text-xl font-bold text-foreground">
            {hideAmounts ? MASKED_AMOUNT : balance.toFixed(4)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Value</p>
          <p className="text-xl font-bold text-primary">
            {hideAmounts ? MASKED_AMOUNT : `$${value.toFixed(2)}`}
          </p>
        </div>
      </div>
    </div>
  )
}
