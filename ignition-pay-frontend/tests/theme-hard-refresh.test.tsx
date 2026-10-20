import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from '../components/theme-toggle'
import { __resetThemeStoreForTests } from '../hooks/use-theme'
import {
  CONTRAST_STORAGE_KEY,
  THEME_STORAGE_KEY,
  storeContrast,
  storeTheme,
  themeBootstrapScript,
} from '../lib/theme'

/**
 * Regression coverage for #865: a hard refresh must keep the stored explicit
 * theme instead of falling back to the OS scheme.
 *
 * The suite runs the real blocking `<head>` script (the one injected by
 * `app/layout.tsx`), then drops the module store to simulate a full page
 * reload, and finally mounts the toggle. No sleeps or wall-clock assertions.
 */

function installMatchMedia(prefersDark: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: prefersDark,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}

function runBootstrap() {
  new Function(themeBootstrapScript)()
}

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.style.colorScheme = ''
  __resetThemeStoreForTests()
})

afterEach(cleanup)

describe('hard refresh keeps the stored theme (#865)', () => {
  it('keeps an explicit light choice while the OS prefers dark', async () => {
    installMatchMedia(true)
    storeTheme('light')

    runBootstrap()
    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('light')

    // A reload re-evaluates the module, so drop the shared store.
    __resetThemeStoreForTests()
    render(<ThemeToggle />)

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Light mode' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    )
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('keeps an explicit dark choice while the OS prefers light', async () => {
    installMatchMedia(false)
    storeTheme('dark')

    runBootstrap()
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')

    __resetThemeStoreForTests()
    render(<ThemeToggle />)

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Dark mode' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    )
    expect(document.documentElement).toHaveClass('dark')
  })

  it('follows the OS after a hard refresh in system mode', async () => {
    installMatchMedia(true)
    storeTheme('system')

    runBootstrap()
    expect(document.documentElement).toHaveClass('dark')

    __resetThemeStoreForTests()
    render(<ThemeToggle />)

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'System theme' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    )
    expect(document.documentElement).toHaveClass('dark')
  })

  it('uses the same storage keys as the persistence helpers', () => {
    installMatchMedia(false)
    storeTheme('light')
    storeContrast('high')

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(window.localStorage.getItem(CONTRAST_STORAGE_KEY)).toBe('high')

    runBootstrap()

    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.documentElement).toHaveClass('high-contrast')
  })
})
