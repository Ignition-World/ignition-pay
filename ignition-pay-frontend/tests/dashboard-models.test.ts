import { describe, expect, it } from 'vitest'
import {
  categorizeAsset,
  groupAssets,
  portfolioChange24h,
  totalValue,
  type AssetBalance,
} from '../features/dashboard/models'

const xlm: AssetBalance = { code: 'XLM', issuer: 'native', balance: 100, value: 11, change24h: 5 }
const usdc: AssetBalance = { code: 'USDC', issuer: 'GISSUER', balance: 50, value: 50, change24h: 0 }
const aqua: AssetBalance = { code: 'AQUA', issuer: 'GAQUA', balance: 10, value: 2.5, change24h: -10 }

describe('categorizeAsset', () => {
  it('classifies the native asset, stablecoins and custom issuers', () => {
    expect(categorizeAsset(xlm)).toBe('native')
    expect(categorizeAsset(usdc)).toBe('stablecoin')
    expect(categorizeAsset(aqua)).toBe('custom')
  })

  it('treats a lowercase stablecoin code as a stablecoin', () => {
    expect(categorizeAsset({ code: 'usdc', issuer: 'GISSUER' })).toBe('stablecoin')
  })
})

describe('groupAssets', () => {
  it('orders groups native, stablecoin, custom and sorts each by value', () => {
    const groups = groupAssets([aqua, usdc, xlm])

    expect(groups.map((group) => group.category)).toEqual(['native', 'stablecoin', 'custom'])
    expect(groups[1].totalValue).toBe(50)
  })

  it('omits groups with no holdings', () => {
    expect(groupAssets([xlm]).map((group) => group.category)).toEqual(['native'])
    expect(groupAssets([])).toEqual([])
  })

  it('sorts assets inside a group by descending value', () => {
    const other: AssetBalance = { code: 'YXLM', issuer: 'GOTHER', balance: 1, value: 99 }
    const [custom] = groupAssets([aqua, other])

    expect(custom.assets.map((asset) => asset.code)).toEqual(['YXLM', 'AQUA'])
  })
})

describe('portfolio totals', () => {
  it('sums asset values', () => {
    expect(totalValue([xlm, usdc, aqua])).toBeCloseTo(63.5)
    expect(totalValue([])).toBe(0)
  })

  it('weights the 24h change by asset value', () => {
    // (11 * 5 + 50 * 0 + 2.5 * -10) / 63.5
    expect(portfolioChange24h([xlm, usdc, aqua])).toBeCloseTo(0.4724, 3)
  })

  it('reports no change for an empty portfolio', () => {
    expect(portfolioChange24h([])).toBe(0)
  })
})
