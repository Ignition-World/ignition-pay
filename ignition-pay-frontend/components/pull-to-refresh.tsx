'use client'

import { ArrowDown, RefreshCw } from 'lucide-react'
import { PULL_THRESHOLD, usePullToRefresh } from '@/hooks/use-pull-to-refresh'

interface PullToRefreshProps {
  onRefresh: () => void | Promise<void>
  children: React.ReactNode
  /** Pull-to-refresh is a touch gesture, so it is disabled on desktop widths. */
  disabled?: boolean
}

/**
 * Wraps scrollable page content with a touch-friendly pull-to-refresh gesture.
 * Desktop users keep the explicit refresh controls in the page header.
 */
export function PullToRefresh({ onRefresh, children, disabled = false }: PullToRefreshProps) {
  const { pullDistance, isRefreshing, isReady, handlers } = usePullToRefresh({
    onRefresh,
    disabled,
  })

  const isActive = pullDistance > 0 || isRefreshing

  return (
    <div {...handlers} className="lg:touch-auto" style={{ overscrollBehaviorY: 'contain' }}>
      <div
        aria-hidden={!isActive}
        className="flex items-center justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: isActive ? Math.max(pullDistance, PULL_THRESHOLD * 0.6) : 0 }}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isRefreshing ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              <span>Refreshing…</span>
            </>
          ) : (
            <>
              <ArrowDown
                size={16}
                className={`transition-transform ${isReady ? 'rotate-180' : ''}`}
              />
              <span>{isReady ? 'Release to refresh' : 'Pull to refresh'}</span>
            </>
          )}
        </div>
      </div>

      <div
        className="transition-transform duration-150"
        style={{ transform: `translateY(${isRefreshing ? 0 : pullDistance * 0.25}px)` }}
      >
        {children}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {isRefreshing ? 'Refreshing balances and recent activity' : ''}
      </p>
    </div>
  )
}
