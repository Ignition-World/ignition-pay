import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from '../components/theme-toggle'
import { __resetThemeStoreForTests, useTheme } from '../hooks/use-theme'
import { themeBootstrapScript } from '../lib/theme'

/**
 * Issue #627 — the theme must survive a refresh and respect a manual selection.
 *
 * The persistence helpers were already correct in isolation; the bug was that
 * `mode` lived in each consumer's own `useState`. Copies disagreed, and any copy
 * still holding `'system'` re-applied the OS theme over an explicit choice. The
 * tests that matter here are therefore the ones about *sharing*.
 */

/** Controllable `prefers-color-scheme`, since jsdom has no media-query engine. */
function installMatchMedia(initialDark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  let matches = initialDark

  window.matchMedia = ((query: string) =>
    ({
      get matches() {
        return matches
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener)
      },
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener)
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia

  return {
    setDark(next: boolean) {
      matches = next
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent)
      }
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.className = ''
  __resetThemeStoreForTests()
})

afterEach(cleanup)

describe('one shared theme store', () => {
  it('gives every consumer the same mode', () => {
    installMatchMedia(false)

    const first = renderHook(() => useTheme())
    const second = renderHook(() => useTheme())

    act(() => first.result.current.setMode('dark'))

    // The settings page mounts two consumers side by side; before this change
    // the second one kept showing the old value.
    expect(first.result.current.mode).toBe('dark')
    expect(second.result.current.mode).toBe('dark')
  })

  it('keeps two rendered toggles in step', () => {
    installMatchMedia(false)
    render(
      <>
        <div data-testid="a">
          <ThemeToggle />
        </div>
        <div data-testid="b">
          <ThemeToggle />
        </div>
      </>,
    )

    const [darkInA] = screen.getAllByRole('radio', { name: 'Dark mode' })
    act(() => {
      fireEvent.click(darkInA)
    })

    for (const radio of screen.getAllByRole('radio', { name: 'Dark mode' })) {
      expect(radio).toHaveAttribute('aria-checked', 'true')
    }
    for (const radio of screen.getAllByRole('radio', { name: 'System theme' })) {
      expect(radio).toHaveAttribute('aria-checked', 'false')
    }
  })

  it('registers one media-query listener however many consumers mount', () => {
    const mql = installMatchMedia(false)

    renderHook(() => useTheme())
    renderHook(() => useTheme())
    renderHook(() => useTheme())

    // Previously one listener per consumer, each able to re-apply 'system'.
    expect(mql.listenerCount).toBe(1)
  })
})

describe('persistence', () => {
  it('writes the chosen mode to localStorage', () => {
    installMatchMedia(false)
    const { result } = renderHook(() => useTheme())

    act(() => result.current.setMode('dark'))

    expect(window.localStorage.getItem('theme')).toBe('dark')
  })

  it('reads the stored mode on the first render after a reload', () => {
    installMatchMedia(false)
    window.localStorage.setItem('theme', 'dark')

    const { result } = renderHook(() => useTheme())

    expect(result.current.mode).toBe('dark')
    expect(result.current.isDark).toBe(true)
  })

  it('survives a remount, which is what a refresh is', () => {
    installMatchMedia(false)
    const first = renderHook(() => useTheme())
    act(() => first.result.current.setMode('dark'))
    first.unmount()

    // A reload re-evaluates the module, so drop the store as the browser would.
    __resetThemeStoreForTests()
    const second = renderHook(() => useTheme())

    expect(second.result.current.mode).toBe('dark')
  })

  it('applies the stored mode to the document', () => {
    installMatchMedia(false)
    window.localStorage.setItem('theme', 'dark')

    renderHook(() => useTheme())

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('falls back to system when nothing is stored', () => {
    installMatchMedia(true)

    const { result } = renderHook(() => useTheme())

    expect(result.current.mode).toBe('system')
    expect(result.current.isSystem).toBe(true)
    expect(result.current.isDark).toBe(true)
  })
})

describe('a manual selection is not overwritten', () => {
  it('ignores an OS scheme change once the user has chosen', () => {
    const mql = installMatchMedia(false)
    const { result } = renderHook(() => useTheme())

    act(() => result.current.setMode('light'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    // The OS goes dark. This is the exact path that used to revert the choice.
    act(() => mql.setDark(true))

    expect(result.current.mode).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('still follows the OS while the mode is system', () => {
    const mql = installMatchMedia(false)
    const { result } = renderHook(() => useTheme())

    expect(result.current.mode).toBe('system')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    act(() => mql.setDark(true))

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(result.current.isDark).toBe(true)
  })

  it('resolves system before flipping, so the first toggle is not a no-op', () => {
    installMatchMedia(true) // OS is dark, mode is system
    const { result } = renderHook(() => useTheme())

    act(() => result.current.toggle())

    // The user is looking at dark, so one press must give light.
    expect(result.current.mode).toBe('light')
  })
})

describe('cross-tab sync', () => {
  it('picks up a change made in another tab', () => {
    installMatchMedia(false)
    const { result } = renderHook(() => useTheme())

    act(() => {
      window.localStorage.setItem('theme', 'dark')
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))
    })

    expect(result.current.mode).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('ignores unrelated storage keys', () => {
    installMatchMedia(false)
    const { result } = renderHook(() => useTheme())

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }))
    })

    expect(result.current.mode).toBe('system')
  })
})

describe('first paint (no flash of the wrong theme)', () => {
  function runBootstrap() {
    // eslint-disable-next-line no-new-func
    new Function(themeBootstrapScript)()
  }

  it('applies a stored dark preference before React runs', () => {
    window.localStorage.setItem('theme', 'dark')
    installMatchMedia(false)

    runBootstrap()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('applies a stored light preference even when the OS prefers dark', () => {
    window.localStorage.setItem('theme', 'light')
    installMatchMedia(true)

    runBootstrap()

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('resolves system from the OS preference', () => {
    installMatchMedia(true)

    runBootstrap()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('applies stored high contrast, and clears it when unset', () => {
    window.localStorage.setItem('contrast', 'high')
    installMatchMedia(false)
    runBootstrap()
    expect(document.documentElement.classList.contains('high-contrast')).toBe(true)

    window.localStorage.setItem('contrast', 'normal')
    runBootstrap()
    // Must be removed, not merely left off — the class survives a soft navigation.
    expect(document.documentElement.classList.contains('high-contrast')).toBe(false)
  })

  it('agrees with the hook about what the stored mode means', () => {
    window.localStorage.setItem('theme', 'dark')
    installMatchMedia(false)

    runBootstrap()
    const beforeReact = document.documentElement.classList.contains('dark')

    renderHook(() => useTheme())
    const afterReact = document.documentElement.classList.contains('dark')

    // If these disagreed the screen would change appearance on hydration, which
    // is the flash this script exists to prevent.
    expect(beforeReact).toBe(true)
    expect(afterReact).toBe(true)
  })
})
