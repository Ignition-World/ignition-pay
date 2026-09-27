import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MASKED_AMOUNT, useHideBalances } from '../hooks/use-hide-balances'

const STORAGE_KEY = 'ignition-pay:hide-balances'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

/**
 * Issue #629 — unit tests for the balance-visibility hook.
 *
 * The hook is small but sits behind a privacy control, and the failure that
 * matters is the quiet one: a preference that silently stops persisting leaves
 * balances on screen for someone who asked for them hidden.
 */
describe('useHideBalances', () => {
  describe('initial state', () => {
    it('starts with balances visible', () => {
      const { result } = renderHook(() => useHideBalances())

      expect(result.current.isHidden).toBe(false)
    })

    it('reads a stored preference on mount', () => {
      window.localStorage.setItem(STORAGE_KEY, 'true')

      const { result } = renderHook(() => useHideBalances())

      expect(result.current.isHidden).toBe(true)
    })

    it('treats any value other than "true" as visible', () => {
      window.localStorage.setItem(STORAGE_KEY, 'yes')

      const { result } = renderHook(() => useHideBalances())

      // Only the exact string counts, so a stale or hand-edited value fails
      // safe toward showing the user their own balances rather than hiding them.
      expect(result.current.isHidden).toBe(false)
    })
  })

  describe('toggling', () => {
    it('flips visibility', () => {
      const { result } = renderHook(() => useHideBalances())

      act(() => result.current.toggle())
      expect(result.current.isHidden).toBe(true)

      act(() => result.current.toggle())
      expect(result.current.isHidden).toBe(false)
    })

    it('persists each flip', () => {
      const { result } = renderHook(() => useHideBalances())

      act(() => result.current.toggle())
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')

      act(() => result.current.toggle())
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false')
    })

    it('survives a remount, which is what persistence is for', () => {
      const first = renderHook(() => useHideBalances())
      act(() => first.result.current.toggle())
      first.unmount()

      const second = renderHook(() => useHideBalances())

      expect(second.result.current.isHidden).toBe(true)
    })
  })

  describe('setHidden', () => {
    it('sets an explicit value and persists it', () => {
      const { result } = renderHook(() => useHideBalances())

      act(() => result.current.setHidden(true))
      expect(result.current.isHidden).toBe(true)
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')

      act(() => result.current.setHidden(false))
      expect(result.current.isHidden).toBe(false)
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false')
    })

    it('is idempotent', () => {
      const { result } = renderHook(() => useHideBalances())

      act(() => result.current.setHidden(true))
      act(() => result.current.setHidden(true))

      expect(result.current.isHidden).toBe(true)
    })
  })

  describe('maskAmount', () => {
    it('returns the formatted amount while visible', () => {
      const { result } = renderHook(() => useHideBalances())

      expect(result.current.maskAmount('$1,234.56')).toBe('$1,234.56')
    })

    it('masks the amount once hidden', () => {
      const { result } = renderHook(() => useHideBalances())

      act(() => result.current.setHidden(true))

      expect(result.current.maskAmount('$1,234.56')).toBe(MASKED_AMOUNT)
    })

    it('masks every amount identically, so lengths leak nothing', () => {
      const { result } = renderHook(() => useHideBalances())
      act(() => result.current.setHidden(true))

      // A mask that varied with the value would leak its magnitude.
      expect(result.current.maskAmount('$1.00')).toBe(
        result.current.maskAmount('$9,999,999.99'),
      )
    })
  })

  describe('when localStorage is unavailable', () => {
    it('renders visible during SSR, before any effect runs', () => {
      // The hook seeds its state with `false` and only reads storage inside an
      // effect, so the server markup and the first client render agree — a read
      // during render would touch `window` and break SSR outright.
      const { result } = renderHook(() => useHideBalances())

      expect(result.current.isHidden).toBe(false)
    })

    it('defaults to visible when reading throws', () => {
      // Private browsing modes throw on access rather than returning null.
      vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
        throw new DOMException('denied')
      })

      const { result } = renderHook(() => useHideBalances())

      expect(result.current.isHidden).toBe(false)
    })

    it('still toggles in memory when writing throws', () => {
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('quota exceeded')
      })

      const { result } = renderHook(() => useHideBalances())

      act(() => result.current.toggle())

      // The preference is best-effort: losing the write must not lose the session.
      expect(result.current.isHidden).toBe(true)
    })

    it('does not throw when storage is missing entirely', () => {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('localStorage is not available')
        },
      })

      try {
        const { result } = renderHook(() => useHideBalances())

        expect(result.current.isHidden).toBe(false)
        act(() => result.current.toggle())
        expect(result.current.isHidden).toBe(true)
      } finally {
        if (descriptor) Object.defineProperty(window, 'localStorage', descriptor)
      }
    })
  })
})
