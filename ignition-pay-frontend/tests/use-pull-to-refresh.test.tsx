import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PULL_THRESHOLD,
  REFRESH_COOLDOWN_MS,
  usePullToRefresh,
} from '../hooks/use-pull-to-refresh'

type PullResult = { current: ReturnType<typeof usePullToRefresh> }

/**
 * jsdom's `TouchEvent` cannot be built from plain objects reliably, so the
 * gesture is replayed through the handlers the hook returns. The hook only
 * ever reads `touches[0].clientY`.
 */
function touchEvent(clientY: number): React.TouchEvent {
  return { touches: [{ clientY }] } as unknown as React.TouchEvent
}

/** A full pull: starts at the top of the page and travels past the threshold. */
function pull(result: PullResult) {
  act(() => {
    result.current.handlers.onTouchStart(touchEvent(0))
    result.current.handlers.onTouchMove(touchEvent(PULL_THRESHOLD * 2))
  })
}

/**
 * Releases the gesture and returns immediately. `onTouchEnd` awaits
 * `onRefresh`, which may still be in flight, and the hook deliberately does not
 * swallow a rejection from it, so the promise is never awaited here.
 */
function release(result: PullResult) {
  act(() => {
    void result.current.handlers.onTouchEnd().catch(() => {})
  })
}

/** Lets the in-flight refresh promise settle and the hook reset its state. */
async function settle() {
  await act(async () => {
    // Enough microtask ticks for `await onRefresh()` plus the `finally` block
    // to run, whatever the refresh promise does.
    for (let tick = 0; tick < 5; tick += 1) {
      await Promise.resolve()
    }
  })
}

describe('usePullToRefresh cooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // jsdom exposes `scrollY` as a getter, so it has to be redefined.
    Object.defineProperty(window, 'scrollY', {
      value: 0,
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('ignores a new gesture while a refresh is still in flight', async () => {
    let finishRefresh: () => void = () => {}
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve
        }),
    )

    const { result } = renderHook(() => usePullToRefresh({ onRefresh }))

    pull(result)
    release(result)
    await settle()

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(result.current.isRefreshing).toBe(true)

    // A second full pull while the first request is unresolved must be dropped.
    pull(result)
    expect(result.current.isReady).toBe(false)
    release(result)
    await settle()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(result.current.isRefreshing).toBe(true)

    await act(async () => {
      finishRefresh()
      for (let tick = 0; tick < 5; tick += 1) {
        await Promise.resolve()
      }
    })
    expect(result.current.isRefreshing).toBe(false)
  })

  it('ignores a gesture inside the cooldown window after a refresh completes', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }))

    pull(result)
    release(result)
    await settle()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(result.current.isRefreshing).toBe(false)

    act(() => {
      vi.advanceTimersByTime(REFRESH_COOLDOWN_MS - 1)
    })

    pull(result)
    expect(result.current.isReady).toBe(false)
    release(result)
    await settle()
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('survives a rapid sequence of gestures without a duplicate fetch', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }))

    for (let attempt = 0; attempt < 5; attempt += 1) {
      pull(result)
      release(result)
      await settle()
      act(() => {
        vi.advanceTimersByTime(10)
      })
    }

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('accepts a legitimate separate refresh once the cooldown elapses', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }))

    pull(result)
    release(result)
    await settle()
    expect(onRefresh).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(REFRESH_COOLDOWN_MS + 1)
    })

    pull(result)
    expect(result.current.isReady).toBe(true)
    release(result)
    await settle()
    expect(onRefresh).toHaveBeenCalledTimes(2)
    expect(result.current.isRefreshing).toBe(false)
  })

  it('measures the cooldown from the end of the request, not the start', async () => {
    let finishRefresh: () => void = () => {}
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve
        }),
    )
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }))

    pull(result)
    release(result)
    await settle()
    expect(onRefresh).toHaveBeenCalledTimes(1)

    // The entire cooldown window elapses while the request is still running.
    act(() => {
      vi.advanceTimersByTime(REFRESH_COOLDOWN_MS)
    })
    await act(async () => {
      finishRefresh()
      for (let tick = 0; tick < 5; tick += 1) {
        await Promise.resolve()
      }
    })

    pull(result)
    expect(result.current.isReady).toBe(false)
    release(result)
    await settle()
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('honours a custom cooldown', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh, cooldownMs: 10_000 }),
    )

    pull(result)
    release(result)
    await settle()

    act(() => {
      vi.advanceTimersByTime(REFRESH_COOLDOWN_MS + 1)
    })
    pull(result)
    release(result)
    await settle()
    expect(onRefresh).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    pull(result)
    release(result)
    await settle()
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })

  it('does not arm the cooldown for a pull that was released too early', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }))

    act(() => {
      result.current.handlers.onTouchStart(touchEvent(0))
      result.current.handlers.onTouchMove(touchEvent(10))
    })
    expect(result.current.isReady).toBe(false)
    release(result)
    await settle()
    expect(onRefresh).not.toHaveBeenCalled()

    pull(result)
    release(result)
    await settle()
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('leaves the cooldown armed after a rejected refresh', async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }))

    pull(result)
    release(result)
    await settle()

    // The spinner clears even though the refresh failed.
    expect(result.current.isRefreshing).toBe(false)
    expect(onRefresh).toHaveBeenCalledTimes(1)

    pull(result)
    release(result)
    await settle()
    expect(onRefresh).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(REFRESH_COOLDOWN_MS + 1)
    })
    pull(result)
    release(result)
    await settle()
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })
})
