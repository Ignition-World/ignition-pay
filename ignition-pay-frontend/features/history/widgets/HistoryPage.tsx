'use client'

import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Download, Search } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { TransactionRow } from '@/components/transaction-row'
import { EmptyState } from '@/components/empty-state'
import { useOptimisticTransactions } from '@/features/history/state'
import { fetchTransactions } from '@/features/history/services'
import type { Transaction, OptimisticTransaction } from '@/features/history/models'
import {
  HISTORY_DATE_PRESETS,
  HISTORY_DIRECTION_FILTERS,
  HISTORY_STATUS_FILTERS,
  availableAssets,
  hasActiveFilters,
  parseHistoryFilters,
  resolveDateRange,
  serialiseHistoryFilters,
  type HistoryFilters,
} from '@/features/history/filters'
import { useToast } from '@/components/ui/toast'

const PAGE_SIZE = 10

/**
 * Free-text search is debounced before it reaches the URL: the query string is
 * now the single source of truth, so writing to it on every keystroke would
 * push a navigation and a refetch per character.
 */
const SEARCH_DEBOUNCE_MS = 300

/**
 * The active filters live in the URL query string rather than in component
 * state, so a filtered view is shareable and survives a reload. This component
 * must therefore be rendered inside a Suspense boundary — see
 * `app/history/page.tsx`, which `useSearchParams` requires for statically
 * rendered routes.
 */
export function HistoryPage() {
  const { optimisticEntries } = useOptimisticTransactions()
  const toast = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const filters = useMemo(
    () => parseHistoryFilters(searchParams),
    [searchParams],
  )
  /** Stable identity for effect dependencies and for the shareable URL. */
  const queryString = useMemo(
    () => serialiseHistoryFilters(filters),
    [filters],
  )

  // Server-side pagination state
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  /**
   * Held only while the user is actively typing. `null` means "defer to the
   * URL", which is the case for every other source of filter changes.
   */
  const [searchDraft, setSearchDraft] = useState<string | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stats derived from all loaded pages (server gives us what it can)
  const [stats, setStats] = useState({ total: 0, sent: 0, received: 0, totalVolume: 0 })

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    },
    [],
  )

  /**
   * Write a filter change into the URL. Every filter goes through here, which
   * is what makes the view shareable — the query string is the only state.
   */
  const applyFilters = useCallback(
    (patch: Partial<HistoryFilters>) => {
      const next = serialiseHistoryFilters({ ...filters, ...patch })
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
    },
    [filters, pathname, router],
  )

  const searchValue = searchDraft ?? filters.search

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchDraft(value)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      searchTimerRef.current = setTimeout(() => {
        searchTimerRef.current = null
        setSearchDraft(null)
        applyFilters({ search: value })
      }, SEARCH_DEBOUNCE_MS)
    },
    [applyFilters],
  )

  /**
   * Translate the URL filters into fetchTransactions arguments, reusing the
   * service's existing options.
   */
  const buildQueryArgs = useCallback(
    () => {
      const { dateFrom, dateTo } = resolveDateRange(filters)
      return {
        limit: PAGE_SIZE,
        status: filters.status !== 'all' ? filters.status : undefined,
        asset: filters.asset !== 'all' ? filters.asset : undefined,
        dateFrom,
        dateTo,
        search: filters.search || undefined,
        type: filters.direction !== 'all' ? filters.direction : undefined,
      }
    },
    [filters],
  )

  /**
   * Load the first page. Replaces any previously loaded transactions.
   */
  const loadFirstPage = useCallback(async () => {
    // Cancel any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setFetchError(null)
    setTransactions([])
    setNextCursor(null)
    setHasMore(false)

    try {
      const result = await fetchTransactions(buildQueryArgs(), controller.signal)
      if (controller.signal.aborted) return
      setTransactions(result.data)
      setNextCursor(result.nextCursor)
      setHasMore(result.hasNextPage)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      const message = 'Failed to load transactions. Please try again.'
      setFetchError(message)
      toast.add({ title: 'Unable to load transactions', description: message, type: 'error' })
    } finally {
      if (!controller.signal.aborted) setIsLoading(false)
    }
  }, [buildQueryArgs, toast])

  /**
   * Load the next page and append to the existing list.
   */
  const loadNextPage = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoadingMore(true)

    try {
      const result = await fetchTransactions(
        { ...buildQueryArgs(), cursor: nextCursor },
        controller.signal,
      )
      if (controller.signal.aborted) return
      setTransactions((prev) => [...prev, ...result.data])
      setNextCursor(result.nextCursor)
      setHasMore(result.hasNextPage)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      const message = 'Failed to load more transactions.'
      setFetchError(message)
      toast.add({ title: 'Unable to load more transactions', description: message, type: 'error' })
    } finally {
      if (!controller.signal.aborted) setIsLoadingMore(false)
    }
  }, [buildQueryArgs, nextCursor, isLoadingMore, toast])

  // Reload from page 1 whenever the filter query string changes
  useEffect(() => {
    loadFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  // Recompute stats whenever the loaded transaction list changes
  useEffect(() => {
    const allVisible = [...optimisticEntries, ...transactions] as (Transaction | OptimisticTransaction)[]
    setStats({
      total: allVisible.length,
      sent: allVisible.filter((tx) => tx.type === 'sent').length,
      received: allVisible.filter((tx) => tx.type === 'received').length,
      totalVolume: allVisible.reduce((acc, tx) => acc + tx.amount, 0),
    })
  }, [transactions, optimisticEntries])

  // Infinite scroll — trigger next page when the sentinel enters the viewport
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadNextPage()
      },
      { rootMargin: '200px 0px' },
    )

    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, loadNextPage])

  const filtersAreActive = hasActiveFilters(filters)

  function clearFilters() {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }
    setSearchDraft(null)
    router.replace(pathname, { scroll: false })
  }

  /**
   * Only offer assets that actually occur in the loaded history, otherwise the
   * dropdown would list codes that can never match a result.
   */
  const assetOptions = useMemo(
    () => availableAssets(transactions, filters.asset),
    [transactions, filters.asset],
  )

  /**
   * Merges optimistic pending entries with real server data.
   * Optimistic entries float to the top (most recent first).
   */
  const visibleTransactions: (Transaction | OptimisticTransaction)[] = [
    ...optimisticEntries,
    ...transactions,
  ]

  const handleExport = useCallback(() => {
    if (visibleTransactions.length === 0) {
      toast.add({ title: 'No data', description: 'There are no transactions to export.', type: 'error' })
      return
    }

    const headers = ['ID', 'Type', 'Amount', 'Asset', 'Status', 'Date', 'Recipient', 'Transaction Hash']
    const csvContent = [
      headers.join(','),
      ...visibleTransactions.map(tx => {
        const id = 'optimisticId' in tx ? tx.optimisticId : tx.id
        const date = new Date(tx.timestamp).toISOString()
        const hash = 'txHash' in tx && tx.txHash ? tx.txHash : ''
        return `${id},${tx.type},${tx.amount},${tx.asset},${tx.status},${date},${tx.recipient},${hash}`
      })
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', 'transactions.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [visibleTransactions, toast])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="px-6 py-8 max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Transaction History
              </h1>
              <p className="text-muted-foreground mt-1">
                View all your Stellar transactions
              </p>
            </div>
            <Link href="/dashboard">
              <Button variant="ghost">← Back</Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <p className="text-xs text-muted-foreground uppercase">
                Total Transactions
              </p>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <p className="text-xs text-muted-foreground uppercase">Sent</p>
              <p className="text-2xl font-bold text-red-500 mt-1">{stats.sent}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <p className="text-xs text-muted-foreground uppercase">Received</p>
              <p className="text-2xl font-bold text-green-500 mt-1">{stats.received}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <p className="text-xs text-muted-foreground uppercase">Total Volume</p>
              <p className="text-2xl font-bold text-primary mt-1">
                {stats.totalVolume.toFixed(0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="border-b border-border bg-card/30 backdrop-blur-sm">
        <div className="px-6 py-4 max-w-7xl mx-auto space-y-3">

          {/* Row 1: search + asset + export */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder="Search by address, asset, or tx hash…"
                  aria-label="Search transactions"
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  value={searchValue}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
              </div>
            </div>

            {/* Asset dropdown — options come from the loaded history */}
            <select
              aria-label="Filter by asset"
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:border-primary"
              value={filters.asset}
              onChange={(e) => applyFilters({ asset: e.target.value })}
            >
              <option value="all">All assets</option>
              {assetOptions.map((asset) => (
                <option key={asset} value={asset}>
                  {asset}
                </option>
              ))}
            </select>

            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download size={16} className="mr-2" />
              Export
            </Button>
          </div>

          {/* Row 2: direction chips + status chips + date range */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Direction chips */}
            <div className="flex gap-2" role="group" aria-label="Filter by direction">
              {HISTORY_DIRECTION_FILTERS.map((d) => (
                <Button
                  key={d.value}
                  variant={filters.direction === d.value ? 'default' : 'outline'}
                  aria-pressed={filters.direction === d.value}
                  onClick={() => applyFilters({ direction: d.value })}
                  size="sm"
                >
                  {d.label}
                </Button>
              ))}
            </div>

            {/* Status chips — values are the statuses the API accepts */}
            <div className="flex gap-2" role="group" aria-label="Filter by status">
              {HISTORY_STATUS_FILTERS.map((s) => (
                <Button
                  key={s.value}
                  variant={filters.status === s.value ? 'default' : 'outline'}
                  aria-pressed={filters.status === s.value}
                  onClick={() => applyFilters({ status: s.value })}
                  size="sm"
                >
                  {s.label}
                </Button>
              ))}
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <label className="text-xs text-muted-foreground whitespace-nowrap" htmlFor="date-range">
                Range
              </label>
              <select
                id="date-range"
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:border-primary"
                value={filters.range}
                onChange={(e) =>
                  applyFilters({
                    range: e.target.value as HistoryFilters['range'],
                    // A preset supersedes any custom bounds.
                    from: '',
                    to: '',
                  })
                }
              >
                {HISTORY_DATE_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <label className="text-xs text-muted-foreground whitespace-nowrap" htmlFor="date-from">
                From
              </label>
              <input
                id="date-from"
                type="date"
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:border-primary"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => applyFilters({ from: e.target.value, range: 'custom' })}
              />
              <label className="text-xs text-muted-foreground whitespace-nowrap" htmlFor="date-to">
                To
              </label>
              <input
                id="date-to"
                type="date"
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:border-primary"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => applyFilters({ to: e.target.value, range: 'custom' })}
              />
              {filtersAreActive && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading transactions…</p>
          </div>
        ) : fetchError ? (
          <div className="text-center py-12">
            <p className="text-red-500 mb-3">{fetchError}</p>
            <Button variant="outline" size="sm" onClick={loadFirstPage}>Retry</Button>
          </div>
        ) : visibleTransactions.length === 0 ? (
          hasActiveFilters ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-2">No transactions found</p>
              <p className="text-sm text-muted-foreground">
                Try adjusting your filters or search terms
              </p>
            </div>
          ) : (
            <EmptyState
              illustration="history"
              title="No transactions yet"
              description="Once you send or receive an asset, your activity will show up here."
              action={{ label: 'Start by receiving assets', href: '/receive' }}
            />
          )
        ) : (
          <div className="space-y-3">
            {visibleTransactions.map((tx) => {
              const key = 'optimisticId' in tx ? tx.optimisticId : tx.id
              return (
                <div key={key}>
                  <TransactionRow transaction={tx} />
                </div>
              )
            })}
            {hasMore && (
              <div ref={sentinelRef} className="flex justify-center py-4 text-sm text-muted-foreground">
                {isLoadingMore ? 'Loading more transactions…' : 'Scroll to load more'}
              </div>
            )}
            {!hasMore && transactions.length > 0 && (
              <div className="flex justify-center py-4 text-sm text-muted-foreground">
                You&apos;ve reached the end of the history.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
