'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  formatAmount,
  spendableBalance,
  validateAmount,
  type SendableAsset,
  MAX_DECIMAL_PLACES,
} from '@/features/send/models'

interface AssetAmountPickerProps {
  assets: SendableAsset[]
  selectedCode: string
  amount: string
  onAssetChange: (code: string) => void
  onAmountChange: (amount: string) => void
}

/**
 * Asset selector plus amount input. Shows the spendable balance for the chosen
 * asset and offers a "Max" shortcut, so the user cannot send more than they hold.
 */
export function AssetAmountPicker({
  assets,
  selectedCode,
  amount,
  onAssetChange,
  onAmountChange,
}: AssetAmountPickerProps) {
  const selected = assets.find((asset) => asset.code === selectedCode) ?? assets[0]
  const available = selected ? spendableBalance(selected) : 0
  const check = selected ? validateAmount(amount, selected) : { isValid: false }
  const showError = amount.trim().length > 0 && !check.isValid

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="asset" className="block text-sm font-semibold text-foreground mb-2">
            Asset
          </label>
          <select
            id="asset"
            className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:border-primary"
            value={selected?.code ?? ''}
            onChange={(event) => {
              onAssetChange(event.target.value)
              // The previous amount may exceed the new asset's balance.
              onAmountChange('')
            }}
          >
            {assets.map((asset) => (
              <option key={`${asset.code}-${asset.issuer}`} value={asset.code}>
                {asset.code} · {formatAmount(spendableBalance(asset))} available
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label htmlFor="amount" className="block text-sm font-semibold text-foreground">
              Amount
            </label>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onAmountChange(formatAmount(available))}
              disabled={available <= 0}
            >
              Max
            </Button>
          </div>
          <Input
            id="amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            className={`h-auto px-4 py-3 ${showError ? 'border-destructive' : ''}`}
            value={amount}
            onChange={(event) => {
              const val = event.target.value
              if (val === "") {
                onAmountChange(val)
                return
              }
              const regex = new RegExp(`^\\d*\\.?\\d{0,${MAX_DECIMAL_PLACES}}$`)
              if (regex.test(val)) {
                onAmountChange(val)
              }
            }}
            aria-invalid={showError}
            aria-describedby="amount-feedback"
            required
          />
        </div>
      </div>

      <p
        id="amount-feedback"
        aria-live="polite"
        className={`text-xs ${showError ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {showError
          ? check.error
          : `Available: ${formatAmount(available)} ${selected?.code ?? ''}${
              selected?.issuer === 'native' ? ' (after reserve and network fee)' : ''
            }`}
      </p>
    </div>
  )
}

