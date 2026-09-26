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

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  return getStoredTheme()
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(getInitialTheme)
  const [contrast, setContrastState] = useState<ContrastLevel>('normal')
  const [hydrated, setHydrated] = useState(false)
  const mqlRef = useRef<MediaQueryList | null>(null)
  const handlerRef = useRef<(() => void) | null>(null)

  // Initialize from storage and mark as hydrated
  useEffect(() => {
    const stored = getStoredTheme()
    const storedContrast = getStoredContrast()
    setModeState(stored)
    setContrastState(storedContrast)
    applyTheme(stored, storedContrast)
    setHydrated(true)
  }, [])

  // Watch system color scheme when in 'system' mode
  useEffect(() => {
    if (!hydrated) return
    const mql = mqlRef.current ?? window.matchMedia('(prefers-color-scheme: dark)')
    mqlRef.current = mql

    if (handlerRef.current) {
      mql.removeEventListener('change', handlerRef.current)
      handlerRef.current = null
    }

    if (mode === 'system') {
      const handler = () => applyTheme('system', contrast)
      handlerRef.current = handler
      mql.addEventListener('change', handler)
    }
    // Apply theme on each mode/contrast change
    applyTheme(mode, contrast)

    return () => {
      if (handlerRef.current) {
        mql.removeEventListener('change', handlerRef.current)
        handlerRef.current = null
      }
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

  const isDark = hydrated && (mode === 'dark' || (mode === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches))
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
