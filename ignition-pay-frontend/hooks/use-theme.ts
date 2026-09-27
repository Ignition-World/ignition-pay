'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ThemeMode,
  ContrastLevel,
  applyTheme,
  getStoredTheme,
  storeTheme,
  getStoredContrast,
  storeContrast,
} from '@/lib/theme'

/**
 * The values the server renders. The first client render must produce exactly
 * these, otherwise React reports a hydration mismatch, so `localStorage` is
 * only ever read from an effect that runs after mount.
 */
const SERVER_MODE: ThemeMode = 'system'
const SERVER_CONTRAST: ContrastLevel = 'normal'

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

function prefersDark(): boolean {
  return window.matchMedia(DARK_SCHEME_QUERY).matches
}

/**
 * Reads the persisted theme and contrast, then applies them to the document.
 * The inline script in `app/layout.tsx` has already set the `dark` and
 * `high-contrast` classes before first paint, so this only has to catch up.
 */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(SERVER_MODE)
  const [contrast, setContrastState] = useState<ContrastLevel>(SERVER_CONTRAST)
  const [hydrated, setHydrated] = useState(false)
  /** Tracked in state so the OS preference is not re-read during render. */
  const [systemPrefersDark, setSystemPrefersDark] = useState(false)
  const mqlRef = useRef<MediaQueryList | null>(null)

  // Adopt the stored preference after mount. `applyTheme` runs here as well as
  // in the effect below so a dark-mode visitor never sees a light flash while
  // the state updates propagate.
  useEffect(() => {
    let storedMode = SERVER_MODE
    let storedContrast = SERVER_CONTRAST
    try {
      storedMode = getStoredTheme()
      storedContrast = getStoredContrast()
    } catch {
      // Private browsing modes can throw on access; fall back to the defaults.
    }

    setModeState(storedMode)
    setContrastState(storedContrast)
    setSystemPrefersDark(prefersDark())
    applyTheme(storedMode, storedContrast)
    setHydrated(true)
  }, [])

  // Re-apply the theme on every mode/contrast change, and keep `system` in
  // sync with the OS preference while it is the active mode.
  useEffect(() => {
    if (!hydrated) return

    const mql = mqlRef.current ?? window.matchMedia(DARK_SCHEME_QUERY)
    mqlRef.current = mql

    const handler = () => {
      setSystemPrefersDark(mql.matches)
      if (mode === 'system') applyTheme('system', contrast)
    }

    if (mode === 'system') mql.addEventListener('change', handler)
    applyTheme(mode, contrast)

    return () => {
      if (mode === 'system') mql.removeEventListener('change', handler)
    }
  }, [mode, hydrated, contrast])

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode)
    storeTheme(newMode)
    applyTheme(newMode, contrast)
  }, [contrast])

  const setContrast = useCallback((newContrast: ContrastLevel) => {
    setContrastState(newContrast)
    storeContrast(newContrast)
    applyTheme(mode, newContrast)
  }, [mode])

  const toggle = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : 'dark')
  }, [mode, setMode])

  const isDark = hydrated && (mode === 'dark' || (mode === 'system' && systemPrefersDark))
  const isLight = hydrated && !isDark
  const isSystem = mode === 'system'
  const isHighContrast = contrast === 'high'

  return {
    mode,
    contrast,
    setMode,
    setContrast,
    toggle,
    isDark,
    isLight,
    isSystem,
    isHighContrast,
    hydrated,
  }
}
