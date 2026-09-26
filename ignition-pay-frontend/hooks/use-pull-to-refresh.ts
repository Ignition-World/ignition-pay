'use client'

import { useCallback, useRef, useState } from 'react'

/** Distance in pixels the user must pull before a refresh is triggered. */
export const PULL_THRESHOLD = 72

/**
 * How long the gesture stays locked out after a refresh settles. Without it a
 * second flick lands while the first fetch is still resolving, which fires a
 * duplicate request for the same data.
 */
export const REFRESH_COOLDOWN_MS = 2000

/** Pulling feels better when the content lags behind the finger. */
const RESISTANCE = 0.5

interface UsePullToRefreshOptions {
  onRefresh: () => void | Promise<void>
  threshold?: number
  disabled?: boolean
  cooldownMs?: number
}

/**
 * Touch-driven pull-to-refresh. The gesture only engages when the page is
 * already scrolled to the top, so it never fights normal scrolling.
 *
 * Two guards run before a gesture is tracked: one while a refresh is in
 * flight, and one for `cooldownMs` after it completes. Both are evaluated from
 * event handlers, so a rapid sequence of flicks cannot slip past.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = PULL_THRESHOLD,
  disabled = false,
  cooldownMs = REFRESH_COOLDOWN_MS,
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startYRef = useRef<number | null>(null)
  /**
   * Wall-clock deadline for the cooldown. A ref is used rather than state
   * because the guard has to read the current time at event time; a state
   * value would be captured by the `useCallback` dependency array and could
   * report a stale verdict for one more gesture.
   */
  const cooldownUntilRef = useRef(0)

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (disabled || isRefreshing) return
      if (Date.now() < cooldownUntilRef.current) return
      if (window.scrollY > 0) return

      startYRef.current = event.touches[0]?.clientY ?? null
    },
    [disabled, isRefreshing],
  )

  const onTouchMove = useCallback(
    (event: React.TouchEvent) => {
      const startY = startYRef.current
      if (startY === null) return

      const currentY = event.touches[0]?.clientY ?? startY
      const delta = (currentY - startY) * RESISTANCE

      if (delta <= 0) {
        // Upward movement means the user is scrolling, not pulling.
        startYRef.current = null
        setPullDistance(0)
        return
      }

      setPullDistance(Math.min(delta, threshold * 1.5))
    },
    [threshold],
  )

  const onTouchEnd = useCallback(async () => {
    const shouldRefresh = startYRef.current !== null && pullDistance >= threshold
    startYRef.current = null

    if (!shouldRefresh) {
      setPullDistance(0)
      return
    }

    setIsRefreshing(true)
    setPullDistance(threshold)
    try {
      await onRefresh()
    } finally {
      // Stamped when the refresh settles, so the cooldown measures from the
      // end of the request rather than the start of the gesture.
      cooldownUntilRef.current = Date.now() + cooldownMs
      setIsRefreshing(false)
      setPullDistance(0)
    }
  }, [onRefresh, pullDistance, threshold, cooldownMs])

  return {
    pullDistance,
    isRefreshing,
    /** True once the user has pulled far enough for a release to refresh. */
    isReady: pullDistance >= threshold,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  }
}
