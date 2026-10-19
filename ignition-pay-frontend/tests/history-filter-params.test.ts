import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HISTORY_FILTERS,
  clearHistoryFilterParams,
  hasActiveFilters,
  hasHistoryFilterParams,
  parseHistoryFilters,
} from '../features/history/filters'

/**
 * #878 — Reset has to work on the *URL*, not only on the parsed filter state.
 *
 * These cover the two helpers the reset control is built on: recognising that
 * the URL still carries history filter params (even ones the parser collapses
 * to their defaults) and stripping them all again.
 */
describe('history filter URL params (#878)', () => {
  const FILTER_KEYS = ['status', 'asset', 'dir', 'type', 'range', 'from', 'to', 'q']

  describe('hasHistoryFilterParams', () => {
    it('is false for a clean URL', () => {
      expect(hasHistoryFilterParams(new URLSearchParams())).toBe(false)
    })

    it('is true for every param the history view owns', () => {
      for (const key of FILTER_KEYS) {
        const params = new URLSearchParams(`${key}=x`)
        expect(hasHistoryFilterParams(params), key).toBe(true)
      }
    })

    it('sees params the parser collapses back to the defaults', () => {
      // `type` is never parsed (the page serialises direction as `dir`) and
      // `CONFIRMED` is not a status the API accepts, so both read as "no
      // active filters" — yet they are still sitting in the URL.
      const params = new URLSearchParams('status=CONFIRMED&type=sent')

      expect(hasActiveFilters(parseHistoryFilters(params))).toBe(false)
      expect(hasHistoryFilterParams(params)).toBe(true)
    })
  })

  describe('clearHistoryFilterParams', () => {
    it('removes every history filter param, recognised or stale', () => {
      const params = new URLSearchParams(
        'status=PENDING&asset=USDC&dir=sent&type=sent&range=7d&from=2026-01-01&to=2026-01-02&q=abc',
      )

      expect(clearHistoryFilterParams(params)).toBe('')
    })

    it('keeps query params that are not filters', () => {
      const params = new URLSearchParams('status=FAILED&utm_source=mail&tour=1')

      expect(clearHistoryFilterParams(params)).toBe('utm_source=mail&tour=1')
    })

    it('leaves a clean URL clean', () => {
      expect(clearHistoryFilterParams(new URLSearchParams())).toBe('')
    })

    it('parses back to the default filters after a reset', () => {
      const cleared = clearHistoryFilterParams(
        new URLSearchParams('status=FAILED&type=sent&q=abc'),
      )

      expect(parseHistoryFilters(new URLSearchParams(cleared))).toEqual(
        DEFAULT_HISTORY_FILTERS,
      )
    })
  })
})
