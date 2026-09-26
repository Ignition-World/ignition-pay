export type AssetCategory = 'native' | 'stablecoin' | 'custom'

export interface AssetBalance {
  code: string
  issuer: string
  balance: number
  /** Fiat (USD) value of `balance`. */
  value: number
  change24h?: number
  /** Recent USD values, oldest first, used to draw the per-asset sparkline. */
  history?: number[]
}

export interface WalletSnapshot {
  address: string
  assets: AssetBalance[]
  /** ISO timestamp of the moment the snapshot was produced. */
  updatedAt: string
}

export interface QuickStats {
  totalTransactions: number
  networkFeeSavedUsd: number
  accountAgeDays: number
  accountCreatedAt?: string
}

export interface AssetGroup {
  category: AssetCategory
  label: string
  description: string
  assets: AssetBalance[]
  totalValue: number
}

/** Asset codes we treat as fiat-pegged, so they group away from volatile assets. */
const STABLECOIN_CODES = new Set(['USDC', 'USDT', 'EURC', 'GYEN', 'BRLC'])

const GROUP_ORDER: AssetCategory[] = ['native', 'stablecoin', 'custom']

const GROUP_LABELS: Record<AssetCategory, { label: string; description: string }> = {
  native: {
    label: 'Native',
    description: 'Lumens held directly on the Stellar network',
  },
  stablecoin: {
    label: 'Stablecoins',
    description: 'Fiat-pegged assets issued by anchors',
  },
  custom: {
    label: 'Other assets',
    description: 'Custom assets from third-party issuers',
  },
}

export function categorizeAsset(asset: Pick<AssetBalance, 'code' | 'issuer'>): AssetCategory {
  if (asset.issuer === 'native' || asset.code === 'XLM') return 'native'
  if (STABLECOIN_CODES.has(asset.code.toUpperCase())) return 'stablecoin'
  return 'custom'
}

export function totalValue(assets: AssetBalance[]): number {
  return assets.reduce((sum, asset) => sum + asset.value, 0)
}

/**
 * Buckets balances into native / stablecoin / custom groups, ordered so the most
 * relevant holdings come first. Empty groups are omitted.
 */
export function groupAssets(assets: AssetBalance[]): AssetGroup[] {
  const buckets = new Map<AssetCategory, AssetBalance[]>()

  for (const asset of assets) {
    const category = categorizeAsset(asset)
    const bucket = buckets.get(category)
    if (bucket) {
      bucket.push(asset)
    } else {
      buckets.set(category, [asset])
    }
  }

  return GROUP_ORDER.flatMap((category) => {
    const grouped = buckets.get(category)
    if (!grouped || grouped.length === 0) return []

    const sorted = [...grouped].sort((a, b) => b.value - a.value)

    return [
      {
        category,
        ...GROUP_LABELS[category],
        assets: sorted,
        totalValue: totalValue(sorted),
      },
    ]
  })
}

/** Value-weighted 24h change across the whole portfolio. */
export function portfolioChange24h(assets: AssetBalance[]): number {
  const total = totalValue(assets)
  if (total === 0) return 0

  const weighted = assets.reduce((sum, asset) => sum + asset.value * (asset.change24h ?? 0), 0)
  return weighted / total
}
