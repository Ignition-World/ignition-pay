'use client'

import { useCallback, useSyncExternalStore } from 'react'
import {
  ContrastLevel,
  ThemeMode,
  applyTheme,
  getStoredContrast,
  getStoredTheme,
  storeContrast,
  storeTheme,
} from '@/lib/theme'

/**
 * Issue #627 — one shared theme store instead of per-hook state.
 *
 * ## The bug
 *
 * `useTheme` used to hold `mode` in its own `useState`, so every consumer got a
 * private copy. The settings page alone mounts two — its own `useTheme()` for the
 * theme `<select>`, and a `<ThemeToggle />` with another — sitting in the same row.
 * Change one and the other still shows the old value.
 *
 * Worse, each copy registered its own `prefers-color-scheme` listener whenever
 * *its* mode was `'system'`. Pick "light" in one consumer and the others keep
 * believing the mode is `'system'`, so the next time the OS scheme changes — or
 * any time one of those effects re-runs — they call `applyTheme('system', …)` and
 * overwrite the explicit choice. That is the reported symptom: the theme reverts
 * to the system default instead of respecting the manual selection.
 *
 * ## The fix
 *
 * Module-level state read through `useSyncExternalStore`, so there is exactly one
 * `mode`, one `contrast`, one media-query listener and one `storage` listener no
 * matter how many components call this hook. Writing the mode notifies every
 * consumer, so they cannot disagree.
 *
 * `getServerSnapshot` returns a fixed pre-hydration snapshot so the server markup
 * and the first client render agree; the real values are read in the one-time
 * client init below. First paint is already correct regardless, because the
 * blocking script in `app/layout.tsx` applies the stored theme before React runs.
 */
interface ThemeState {
  mode: ThemeMode
  contrast: ContrastLevel
  /** True once the stored preference has been read on the client. */
  hydrated: boolean
  /** Whether the OS currently prefers dark, used to resolve `'system'`. */
  systemDark: boolean
}

const SERVER_SNAPSHOT: ThemeState = {
  mode: 'system',
  contrast: 'normal',
  hydrated: false,
  systemDark: false,
}

let state: ThemeState = SERVER_SNAPSHOT

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function setState(patch: Partial<ThemeState>): void {
  state = { ...state, ...patch }
  emit()
}

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

let initialized = false

/**
 * Reads the stored preference and attaches the single set of listeners.
 *
 * Runs once per page, on the first subscription, rather than once per consumer —
 * which is the whole point of the change.
 */
function initialize(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const mode = getStoredTheme()
  const contrast = getStoredContrast()

  state = { mode, contrast, hydrated: true, systemDark: prefersDark() }
  applyTheme(mode, contrast)

  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  mql.addEventListener('change', (event) => {
    setState({ systemDark: event.matches })
    // Only a system-mode preference follows the OS. An explicit choice is left
    // alone, which is exactly what the old per-consumer listeners got wrong.
    if (state.mode === 'system') applyTheme('system', state.contrast)
  })

  // Keep tabs in step. Without this, changing the theme in one tab leaves every
  // other tab showing the old one until it reloads.
  window.addEventListener('storage', (event) => {
    if (event.key === 'theme') {
      const next = getStoredTheme()
      setState({ mode: next })
      applyTheme(next, state.contrast)
      return
    }
    if (event.key === 'contrast') {
      const next = getStoredContrast()
      setState({ contrast: next })
      applyTheme(state.mode, next)
    }
  })
}

function subscribe(listener: () => void): () => void {
  initialize()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): ThemeState {
  return state
}

function getServerSnapshot(): ThemeState {
  return SERVER_SNAPSHOT
}

/** Sets the theme mode for every consumer, and persists it. */
export function setThemeMode(mode: ThemeMode): void {
  setState({ mode })
  storeTheme(mode)
  applyTheme(mode, state.contrast)
}

/** Sets the contrast level for every consumer, and persists it. */
export function setThemeContrast(contrast: ContrastLevel): void {
  setState({ contrast })
  storeContrast(contrast)
  applyTheme(state.mode, contrast)
}

/**
 * Resets the shared store. Test-only.
 *
 * Module state outlives a test's render, so without this one test's theme leaks
 * into the next.
 */
export function __resetThemeStoreForTests(): void {
  state = SERVER_SNAPSHOT
  initialized = false
  listeners.clear()
}

/**
 * Reads and writes the shared theme preference.
 *
 * @returns The current mode and contrast, setters, and resolved booleans.
 */
export function useTheme() {
  const { mode, contrast, hydrated, systemDark } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )

  const setMode = useCallback((next: ThemeMode) => setThemeMode(next), [])
  const setContrast = useCallback(
    (next: ContrastLevel) => setThemeContrast(next),
    [],
  )

  const toggle = useCallback(() => {
    // Resolve `system` before flipping, so the first press moves away from
    // whatever the user is actually looking at rather than to its opposite.
    const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
    setThemeMode(resolved === 'dark' ? 'light' : 'dark')
  }, [mode, systemDark])

  const isDark = hydrated && (mode === 'dark' || (mode === 'system' && systemDark))

  return {
    mode,
    contrast,
    setMode,
    setContrast,
    toggle,
    isDark,
    isLight: hydrated && !isDark,
    isSystem: mode === 'system',
    isHighContrast: contrast === 'high',
    hydrated,
  }
}
