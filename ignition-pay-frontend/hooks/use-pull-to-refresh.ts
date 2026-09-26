'use client'

import { useCallback, useRef, useState } from 'react'

/** Distance in pixels the user must pull before a refresh is triggered. */
export const PULL_THRESHOLD = 72

/** Pulling feels better when the content lags behind the finger. */
const RESISTANCE = 0.5

interface UsePullToRefreshOptions {
  onRefresh: () => void | Promise<void>
  threshold?: number
  disabled?: boolean
}

/**
 * Touch-driven pull-to-refresh. The gesture only engages when the page is
 * already scrolled to the top, so it never fights normal scrolling.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = PULL_THRESHOLD,
  disabled = false,
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startYRef = useRef<number | null>(null)

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (disabled || isRefreshing) return
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
      setIsRefreshing(false)
      setPullDistance(0)
    }
  }, [onRefresh, pullDistance, threshold])

  return {
    pullDistance,
    isRefreshing,
    /** True once the user has pulled far enough for a release to refresh. */
    isReady: pullDistance >= threshold,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  }
}
