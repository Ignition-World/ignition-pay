import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MINIMUM_SKELETON_MS,
  useMinimumLoading,
} from '../hooks/use-minimum-loading'
import {
  PORTFOLIO_SUMMARY_SHELL,
  PortfolioSummaryCard,
  PortfolioSummaryCardSkeleton,
} from '../components/portfolio-summary-card'
import {
  TRANSACTION_ROW_SHELL,
  TransactionRowSkeleton,
} from '../components/transaction-row'

afterEach(cleanup)

/**
 * Issue #625 — dashboard loading skeletons.
 *
 * The dashboard already rendered placeholder boxes while data loaded, so the two
 * criteria that were actually missing are the ones covered here: a minimum
 * on-screen time so a fast response does not flash, and placeholders that occupy
 * the same space as the components they stand in for.
 */
describe('useMinimumLoading', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts false when nothing is loading', () => {
    const { result } = renderHook(() => useMinimumLoading(false))
    expect(result.current).toBe(false)
  })

  it('holds the skeleton for the floor when data arrives immediately', () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useMinimumLoading(loading),
      { initialProps: { loading: true } },
    )

    expect(result.current).toBe(true)

    // Data lands after 30ms — the flash case this exists to prevent.
    act(() => void vi.advanceTimersByTime(30))
    rerender({ loading: false })
    expect(result.current).toBe(true)

    // Still held just before the floor elapses.
    act(() => void vi.advanceTimersByTime(MINIMUM_SKELETON_MS - 30 - 1))
    expect(result.current).toBe(true)

    act(() => void vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
  })

  it('does not delay a request slower than the floor', () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useMinimumLoading(loading),
      { initialProps: { loading: true } },
    )

    act(() => void vi.advanceTimersByTime(MINIMUM_SKELETON_MS + 500))
    rerender({ loading: false })

    // The floor already elapsed while loading, so release is immediate.
    expect(result.current).toBe(false)
  })

  it('does not restart the floor on a re-render while still loading', () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useMinimumLoading(loading),
      { initialProps: { loading: true } },
    )

    act(() => void vi.advanceTimersByTime(300))
    rerender({ loading: true })
    act(() => void vi.advanceTimersByTime(100))
    rerender({ loading: false })

    // 400ms have already passed in total, so nothing is held back.
    expect(result.current).toBe(false)
  })

  it('holds again for a second load', () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useMinimumLoading(loading),
      { initialProps: { loading: true } },
    )

    act(() => void vi.advanceTimersByTime(MINIMUM_SKELETON_MS))
    rerender({ loading: false })
    expect(result.current).toBe(false)

    rerender({ loading: true })
    expect(result.current).toBe(true)

    rerender({ loading: false })
    expect(result.current).toBe(true)

    act(() => void vi.advanceTimersByTime(MINIMUM_SKELETON_MS))
    expect(result.current).toBe(false)
  })

  it('respects a custom floor', () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useMinimumLoading(loading, 1000),
      { initialProps: { loading: true } },
    )

    rerender({ loading: false })
    act(() => void vi.advanceTimersByTime(999))
    expect(result.current).toBe(true)

    act(() => void vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
  })
})

describe('PortfolioSummaryCardSkeleton', () => {
  it('announces itself as busy without exposing placeholder text', () => {
    render(<PortfolioSummaryCardSkeleton />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Loading portfolio summary')
    // The decorative blocks must be hidden from assistive tech.
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('uses the same shell as the real card, so nothing shifts on swap', () => {
    const { container: skeleton } = render(<PortfolioSummaryCardSkeleton />)
    const skeletonShell = skeleton.firstElementChild?.className

    cleanup()

    const { container: real } = render(
      <PortfolioSummaryCard
        address="GBJCHUKZMTFSLOMNC7P4TS4VJJBTCYL3YCWKEANE7FCNHWHP6ZPWPX3"
        totalValue={1234.5}
        change24h={1.25}
        assetCount={3}
        updatedAt={new Date().toISOString()}
        isRefreshing={false}
        isLive
        onRefresh={() => {}}
      />,
    )
    const realShell = real.firstElementChild?.className

    expect(skeletonShell).toBe(realShell)
    expect(realShell).toBe(PORTFOLIO_SUMMARY_SHELL)
  })
})

describe('TransactionRowSkeleton', () => {
  it('renders one placeholder per requested row', () => {
    const { container } = render(<TransactionRowSkeleton count={4} />)

    const rows = container.querySelectorAll('.animate-pulse')
    expect(rows).toHaveLength(4)
  })

  it('defaults to three rows', () => {
    const { container } = render(<TransactionRowSkeleton />)

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3)
  })

  it('gives each placeholder the same box model as a real row', () => {
    const { container } = render(<TransactionRowSkeleton count={1} />)
    const row = container.querySelector('.animate-pulse')

    for (const cls of TRANSACTION_ROW_SHELL.split(' ')) {
      expect(row?.classList.contains(cls)).toBe(true)
    }
  })

  it('announces itself once, not once per row', () => {
    render(<TransactionRowSkeleton count={5} />)

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Loading transactions')
  })
})
