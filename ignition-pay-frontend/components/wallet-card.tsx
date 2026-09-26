'use client'

import type { AssetBalance } from '@/features/dashboard/models'
import { Sparkline } from '@/components/sparkline'
import { MASKED_AMOUNT } from '@/hooks/use-hide-balances'
import { useTranslation } from '@/lib/i18n'

interface WalletCardProps {
  asset: AssetBalance
  /** When true, amounts are masked for privacy. */
  hideAmounts?: boolean
}

/** Per-asset balance card: one is rendered for every asset the wallet holds. */
export function WalletCard({ asset, hideAmounts = false }: WalletCardProps) {
  const { t } = useTranslation()
  const { code, issuer, balance, value, change24h, history } = asset
  const change = change24h ?? 0
  const isNative = issuer === 'native'
  const displayIssuer = isNative ? t('walletCard.nativeAsset') : `${issuer.slice(0, 6)}...${issuer.slice(-4)}`
  const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'

  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-card to-card border border-border p-5 space-y-4 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">{code.slice(0, 1)}</span>
          </div>
          <div>
            <p className="font-semibold text-foreground">{code}</p>
            <p className="text-xs text-muted-foreground font-mono">{displayIssuer}</p>
          </div>
        </div>
        {change24h !== undefined && (
          <span
            className={`text-sm font-semibold ${
              trend === 'up'
                ? 'text-green-500'
                : trend === 'down'
                  ? 'text-red-500'
                  : 'text-muted-foreground'
            }`}
          >
            {change > 0 ? '+' : ''}
            {change.toFixed(2)}%
          </span>
        )}
      </div>

      {history && history.length > 1 && (
        <Sparkline points={history} trend={trend} label={t('walletCard.valueOver7d', { code })} />
      )}

      <div className="flex items-end justify-between pt-2 border-t border-border">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('walletCard.balance')}</p>
          <p className="text-xl font-bold text-foreground mt-1">
            {hideAmounts ? MASKED_AMOUNT : balance.toFixed(4)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('walletCard.value')}</p>
          <p className="text-xl font-bold text-primary mt-1">
            {hideAmounts ? MASKED_AMOUNT : `$${value.toFixed(2)}`}
          </p>
        </div>
      </div>
    </div>
  )
}
