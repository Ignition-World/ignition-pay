'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'ignition-pay:hide-balances'

/** Placeholder shown in place of a hidden amount. */
export const MASKED_AMOUNT = '••••••'

function readStoredPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    // Private browsing modes can throw on access; default to showing amounts.
    return false
  }
}

/**
 * Tracks the "hide amounts" privacy preference. The preference is persisted so
 * balances stay hidden across reloads, and starts visible during SSR so the
 * markup matches the server render.
 */
export function useHideBalances() {
  const [isHidden, setIsHidden] = useState(false)

  useEffect(() => {
    setIsHidden(readStoredPreference())
  }, [])

  const setHidden = useCallback((hidden: boolean) => {
    setIsHidden(hidden)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(hidden))
    } catch {
      // Preference is best-effort: keep the in-memory state either way.
    }
  }, [])

  const toggle = useCallback(() => setHidden(!isHidden), [isHidden, setHidden])

  /** Returns `formatted` unless amounts are hidden, in which case it masks it. */
  const maskAmount = useCallback(
    (formatted: string) => (isHidden ? MASKED_AMOUNT : formatted),
    [isHidden],
  )

  return { isHidden, setHidden, toggle, maskAmount }
}
