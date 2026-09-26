import { describe, it, expect } from 'vitest'
import {
  DEFAULT_HISTORY_FILTERS,
  HISTORY_STATUS_FILTERS,
  availableAssets,
  hasActiveFilters,
  parseHistoryFilters,
  resolveDateRange,
  serialiseHistoryFilters,
  type HistoryFilters,
} from '../filters'

const filters = (overrides: Partial<HistoryFilters> = {}): HistoryFilters => ({
  ...DEFAULT_HISTORY_FILTERS,
  ...overrides,
})

describe('history filters', () => {
  describe('status filter values', () => {
    it('only offers statuses the API accepts', () => {
      // Mirrors the TransactionStatus enum in the API's Prisma schema and the
      // `IsIn` list on GetTransactionsQueryDto. `CONFIRMED` is a UI label only.
      expect(HISTORY_STATUS_FILTERS.map((option) => option.value)).toEqual([
        'all',
        'COMPLETED',
        'FAILED',
        'PENDING',
      ])
    })

    it('labels COMPLETED as Confirmed', () => {
      const confirmed = HISTORY_STATUS_FILTERS.find(
        (option) => option.value === 'COMPLETED',
      )
      expect(confirmed?.label).toBe('Confirmed')
    })
  })

  describe('parseHistoryFilters', () => {
    it('returns the defaults for an empty query string', () => {
      expect(parseHistoryFilters(new URLSearchParams())).toEqual(
        DEFAULT_HISTORY_FILTERS,
      )
    })

    it('reads every supported parameter', () => {
      const params = new URLSearchParams({
        status: 'FAILED',
        asset: 'USDC',
        dir: 'sent',
        range: 'custom',
        from: '2026-01-01',
        to: '2026-01-31',
        q: 'GABC',
      })

      expect(parseHistoryFilters(params)).toEqual({
        status: 'FAILED',
        asset: 'USDC',
        direction: 'sent',
        range: 'custom',
        from: '2026-01-01',
        to: '2026-01-31',
        search: 'GABC',
      })
    })

    it('ignores a status the API would reject', () => {
      const params = new URLSearchParams({ status: 'CONFIRMED' })
      expect(parseHistoryFilters(params).status).toBe('all')
    })

    it('ignores an unknown direction and date preset', () => {
      const params = new URLSearchParams({ dir: 'sideways', range: '42d' })
      const parsed = parseHistoryFilters(params)
      expect(parsed.direction).toBe('all')
      expect(parsed.range).toBe('all')
    })

    it('rejects malformed custom dates', () => {
      const params = new URLSearchParams({ from: '01/01/2026', to: 'yesterday' })
      const parsed = parseHistoryFilters(params)
      expect(parsed.from).toBe('')
      expect(parsed.to).toBe('')
    })

    it('treats a bare from/to pair as a custom range', () => {
      const params = new URLSearchParams({ from: '2026-01-01' })
      expect(parseHistoryFilters(params).range).toBe('custom')
    })
  })

  describe('serialiseHistoryFilters', () => {
    it('produces an empty string when nothing is filtered', () => {
      expect(serialiseHistoryFilters(DEFAULT_HISTORY_FILTERS)).toBe('')
    })

    it('omits defaults so an unfiltered URL stays clean', () => {
      expect(
        serialiseHistoryFilters(filters({ asset: 'XLM', status: 'all' })),
      ).toBe('asset=XLM')
    })

    it('composes multiple filters', () => {
      const query = serialiseHistoryFilters(
        filters({ status: 'PENDING', asset: 'XLM', direction: 'received', q: 'abc' }),
      )
      const params = new URLSearchParams(query)
      expect(params.get('status')).toBe('PENDING')
      expect(params.get('asset')).toBe('XLM')
      expect(params.get('dir')).toBe('received')
      expect(params.get('q')).toBe('abc')
    })

    it('round-trips through parse', () => {
      const original = filters({
        status: 'COMPLETED',
        asset: 'USDC',
        direction: 'sent',
        range: 'custom',
        from: '2026-01-01',
        to: '2026-01-31',
        search: 'hash',
      })
      expect(
        parseHistoryFilters(new URLSearchParams(serialiseHistoryFilters(original))),
      ).toEqual(original)
    })

    it('drops custom bounds when a relative preset is chosen', () => {
      const query = serialiseHistoryFilters(
        filters({ range: '30d', from: '2026-01-01', to: '2026-01-31' }),
      )
      expect(new URLSearchParams(query).get('from')).toBeNull()
      expect(new URLSearchParams(query).get('to')).toBeNull()
    })
  })

  describe('hasActiveFilters', () => {
    it('is false for the defaults', () => {
      expect(hasActiveFilters(DEFAULT_HISTORY_FILTERS)).toBe(false)
    })

    it.each([
      ['status', { status: 'FAILED' as const }],
      ['asset', { asset: 'USDC' }],
      ['direction', { direction: 'sent' as const }],
      ['date preset', { range: '7d' as const }],
      ['custom range', { range: 'custom' as const, from: '2026-01-01' }],
      ['search', { search: 'abc' }],
    ])('is true when %s is set', (_label, patch) => {
      expect(hasActiveFilters(filters(patch))).toBe(true)
    })
  })

  describe('resolveDateRange', () => {
    const now = new Date('2026-03-15T12:00:00.000Z')

    it('returns nothing for the all-time preset', () => {
      expect(resolveDateRange(filters({ range: 'all' }), now)).toEqual({})
    })

    it.each([
      ['7d', 7],
      ['30d', 30],
      ['90d', 90],
    ])('resolves the %s preset to a %i day window', (range, days) => {
      const result = resolveDateRange(filters({ range: range as '7d' }), now)
      expect(result.dateTo).toBe(now.toISOString())
      expect(result.dateFrom).toBe(
        new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
      )
    })

    it('passes a custom range through unchanged', () => {
      expect(
        resolveDateRange(
          filters({ range: 'custom', from: '2026-01-01', to: '2026-01-31' }),
          now,
        ),
      ).toEqual({ dateFrom: '2026-01-01', dateTo: '2026-01-31' })
    })

    it('omits an empty custom bound', () => {
      expect(
        resolveDateRange(filters({ range: 'custom', from: '2026-01-01' }), now),
      ).toEqual({ dateFrom: '2026-01-01', dateTo: undefined })
    })
  })

  describe('availableAssets', () => {
    it('lists the distinct assets present in the loaded history', () => {
      const assets = availableAssets([
        { asset: 'USDC' },
        { asset: 'XLM' },
        { asset: 'USDC' },
      ])
      expect(assets).toEqual(['USDC', 'XLM'])
    })

    it('is empty when nothing is loaded', () => {
      expect(availableAssets([])).toEqual([])
    })

    it('keeps the selected asset even when it is not in the loaded page', () => {
      expect(availableAssets([{ asset: 'XLM' }], 'AQUA')).toEqual(['AQUA', 'XLM'])
    })

    it('does not add an "all" entry — the caller renders that itself', () => {
      expect(availableAssets([{ asset: 'XLM' }], 'all')).toEqual(['XLM'])
    })

    it('skips empty asset codes', () => {
      expect(availableAssets([{ asset: '' }, { asset: 'XLM' }])).toEqual(['XLM'])
    })
  })
})
