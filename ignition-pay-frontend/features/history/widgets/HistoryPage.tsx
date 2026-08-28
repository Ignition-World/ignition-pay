'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { Download, Search } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { TransactionRow } from '@/components/transaction-row'
import { useOptimisticTransactions } from '@/features/history/state'
import { fetchTransactions } from '@/features/history/services'
import type { Transaction, OptimisticTransaction } from '@/features/history/models'
import { useToast } from '@/components/ui/toast'

const PAGE_SIZE = 10
const STATUS_OPTIONS = ['all', 'confirmed', 'pending'] as const
type StatusOption = (typeof STATUS_OPTIONS)[number]

export function HistoryPage() {
  const { optimisticEntries } = useOptimisticTransactions()
  const toast = useToast()

  const [filterType, setFilterType] = useState<'all' | 'sent' | 'received'>('all')
  const [filterAsset, setFilterAsset] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<StatusOption>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')

  // Server-side pagination state
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Stats derived from all loaded pages (server gives us what it can)
  const [stats, setStats] = useState({ total: 0, sent: 0, received: 0, totalVolume: 0 })

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  /**
   * Translate the UI filter state into fetchTransactions arguments.
   */
  const buildQueryArgs = useCallback(() => ({
    limit: PAGE_SIZE,
    status: filterStatus !== 'all' ? filterStatus.toUpperCase() : undefined,
    asset: filterAsset !== 'all' ? filterAsset : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: searchTerm || undefined,
    type: filterType !== 'all' ? filterType : undefined,
  }), [filterType, filterAsset, filterStatus, dateFrom, dateTo, searchTerm])

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

  // Reload from page 1 whenever filters change
  useEffect(() => {
    loadFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterAsset, filterStatus, dateFrom, dateTo, searchTerm])

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

  const hasActiveFilters =
    filterType !== 'all' ||
    filterAsset !== 'all' ||
    filterStatus !== 'all' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    searchTerm !== ''

  function clearFilters() {
    setFilterType('all')
    setFilterAsset('all')
    setFilterStatus('all')
    setDateFrom('')
    setDateTo('')
    setSearchTerm('')
  }

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

          {/* Row 1: search + export */}
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
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Asset dropdown */}
            <select
              aria-label="Filter by asset"
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:border-primary"
              value={filterAsset}
              onChange={(e) => setFilterAsset(e.target.value)}
            >
              {['all', 'XLM', 'USDC', 'AQUA'].map((a) => (
                <option key={a} value={a}>
                  {a === 'all' ? 'All assets' : a}
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
              {(['all', 'sent', 'received'] as const).map((d) => (
                <Button
                  key={d}
                  variant={filterType === d ? 'default' : 'outline'}
                  onClick={() => setFilterType(d)}
                  size="sm"
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </Button>
              ))}
            </div>

            {/* Status chips */}
            <div className="flex gap-2" role="group" aria-label="Filter by status">
              {STATUS_OPTIONS.map((s) => (
                <Button
                  key={s}
                  variant={filterStatus === s ? 'default' : 'outline'}
                  onClick={() => setFilterStatus(s)}
                  size="sm"
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Button>
              ))}
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-xs text-muted-foreground whitespace-nowrap" htmlFor="date-from">
                From
              </label>
              <input
                id="date-from"
                type="date"
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:border-primary"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <label className="text-xs text-muted-foreground whitespace-nowrap" htmlFor="date-to">
                To
              </label>
              <input
                id="date-to"
                type="date"
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:border-primary"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
              />
              {hasActiveFilters && (
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
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-2">No transactions found</p>
            <p className="text-sm text-muted-foreground">
              Try adjusting your filters or search terms
            </p>
          </div>
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
