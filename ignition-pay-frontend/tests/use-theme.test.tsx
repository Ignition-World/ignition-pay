import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTheme } from '../hooks/use-theme'
import { ThemeToggle } from '../components/theme-toggle'

/**
 * Installs a controllable `prefers-color-scheme` so the `system` branch of the
 * hook can be exercised: `setPrefersDark` flips the value and `emitChange`
 * fires the listeners the hook registered.
 */
function stubColorScheme() {
  const listeners: Array<(event: MediaQueryListEvent) => void> = []
  let prefersDark = false

  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    const mql = {
      get matches() {
        return query.includes('dark') ? prefersDark : false
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.push(listener)
      },
      removeEventListener: (
        _type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      },
      dispatchEvent: () => false,
    } as unknown as MediaQueryList
    return mql
  })

  return {
    setPrefersDark(value: boolean) {
      prefersDark = value
    },
    emitChange() {
      for (const listener of [...listeners]) {
        listener(new Event('change') as MediaQueryListEvent)
      }
    },
    listenerCount() {
      return listeners.length
    },
  }
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('reports the server defaults on the first render, before touching storage', () => {
    localStorage.setItem('theme', 'dark')
    localStorage.setItem('contrast', 'high')

    // Capture every value the hook returned so the first (hydration) render
    // can be inspected separately from the post-mount renders.
    const renders: Array<ReturnType<typeof useTheme>> = []
    const { result } = renderHook(() => {
      const value = useTheme()
      renders.push(value)
      return value
    })

    // React may render more than once under StrictMode-free RTL, but the first
    // entry is the render that has to match the server HTML.
    expect(renders[0].mode).toBe('system')
    expect(renders[0].contrast).toBe('normal')
    expect(renders[0].hydrated).toBe(false)
    expect(renders[0].isDark).toBe(false)
    expect(renders[0].isLight).toBe(false)
    expect(renders[0].isHighContrast).toBe(false)

    expect(result.current.hydrated).toBe(true)
    expect(result.current.mode).toBe('dark')
    expect(result.current.contrast).toBe('high')
  })

  it('applies the stored mode and contrast to the document after mount', async () => {
    localStorage.setItem('theme', 'dark')
    localStorage.setItem('contrast', 'high')

    const { result } = renderHook(() => useTheme())

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement).toHaveClass('high-contrast')
  })

  it('persists mode changes through setMode', async () => {
    const scheme = stubColorScheme()
    const { result } = renderHook(() => useTheme())
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => result.current.setMode('dark'))

    expect(result.current.mode).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')

    // A later OS change must not override an explicit choice.
    scheme.setPrefersDark(false)
    scheme.emitChange()
    expect(document.documentElement).toHaveClass('dark')
  })

  it('persists contrast changes through setContrast and clears the class again', async () => {
    const { result } = renderHook(() => useTheme())
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => result.current.setContrast('high'))
    expect(result.current.contrast).toBe('high')
    expect(result.current.isHighContrast).toBe(true)
    expect(localStorage.getItem('contrast')).toBe('high')
    expect(document.documentElement).toHaveClass('high-contrast')

    act(() => result.current.setContrast('normal'))
    expect(result.current.isHighContrast).toBe(false)
    expect(document.documentElement).not.toHaveClass('high-contrast')
  })

  it('resolves system mode from the OS preference on first load', async () => {
    const scheme = stubColorScheme()
    scheme.setPrefersDark(true)

    const { result } = renderHook(() => useTheme())

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(result.current.isSystem).toBe(true)
    expect(result.current.isDark).toBe(true)
    expect(document.documentElement).toHaveClass('dark')
  })

  it('tracks OS preference changes while in system mode', async () => {
    const scheme = stubColorScheme()
    const { result } = renderHook(() => useTheme())
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(result.current.isDark).toBe(false)
    await waitFor(() => expect(scheme.listenerCount()).toBeGreaterThan(0))

    act(() => {
      scheme.setPrefersDark(true)
      scheme.emitChange()
    })

    await waitFor(() => expect(result.current.isDark).toBe(true))
    expect(document.documentElement).toHaveClass('dark')
  })

  it('stops listening for OS changes once an explicit mode is chosen', async () => {
    const scheme = stubColorScheme()
    const { result } = renderHook(() => useTheme())
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    await waitFor(() => expect(scheme.listenerCount()).toBe(1))

    act(() => result.current.setMode('light'))

    await waitFor(() => expect(scheme.listenerCount()).toBe(0))
  })

  it('falls back to the defaults when storage access throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage is blocked')
    })

    const { result } = renderHook(() => useTheme())

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(result.current.mode).toBe('system')
    expect(result.current.contrast).toBe('normal')
  })

  it('toggles between light and dark', async () => {
    stubColorScheme()
    const { result } = renderHook(() => useTheme())
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => result.current.toggle())
    expect(result.current.mode).toBe('dark')

    act(() => result.current.toggle())
    expect(result.current.mode).toBe('light')
  })
})

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders the interactive control once the hook has hydrated', () => {
    render(<ThemeToggle />)

    // The `opacity-0` placeholder is the pre-hydration markup; the first
    // client render has to be able to produce it, and `useTheme` above proves
    // it still does, so the control is fully interactive once effects flush.
    const group = screen.getByRole('radiogroup', { name: 'Theme selector' })
    expect(group).not.toHaveClass('opacity-0')
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('marks the stored mode as checked once hydrated', async () => {
    localStorage.setItem('theme', 'dark')
    render(<ThemeToggle />)

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Dark mode' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    )
  })

  it('exposes the appearance target the onboarding tour highlights', async () => {
    render(<ThemeToggle />)

    await waitFor(() =>
      expect(
        screen.getByRole('radiogroup', { name: 'Theme selector' }),
      ).toHaveAttribute('data-tour', 'appearance'),
    )
  })
})
