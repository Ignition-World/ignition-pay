'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WalletSnapshot, AssetBalance } from '@/features/dashboard/models'
import {
  BALANCE_POLL_INTERVAL_MS,
  demoWalletSnapshot,
  fetchWalletSnapshot,
  fetchStellarDexPrices,
  subscribeToStellarPriceFeed,
  fetchQuickStats,
  type QuickStatsData,
  isLiveDataConfigured,
  subscribeToWalletStream,
  resolveWalletAddress,
} from '@/features/dashboard/services'
import { ErrorMessage, ErrorCode } from '@/lib/constants'

export type BalanceStatus = 'loading' | 'ready' | 'error'

export interface WalletBalancesState {
  snapshot: WalletSnapshot | null
  status: BalanceStatus
  /** Populated whenever `status` is `error`. */
  error: string | null
  /** True while a background refresh runs over already-rendered data. */
  isRefreshing: boolean
  /** True when balances arrive over a stream rather than by polling. */
  isLive: boolean
  refresh: () => void
}

/**
 * Keeps dashboard balances fresh: loads a snapshot, then subscribes to the
 * backend notification stream and live Stellar DEX price feeds.
 */
export function useWalletBalances(addressProp?: string): WalletBalancesState {
  const address = resolveWalletAddress(addressProp)
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null)
  const [status, setStatus] = useState<BalanceStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const requestRef = useRef<AbortController | null>(null)
  const hasSnapshotRef = useRef(false)

  const load = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    if (hasSnapshotRef.current) {
      setIsRefreshing(true)
    } else {
      setStatus('loading')
    }

    try {
      const baseSnapshot = isLiveDataConfigured()
        ? await fetchWalletSnapshot(address, controller.signal)
        : demoWalletSnapshot()

      if (controller.signal.aborted) return

      // Enhance assets with real Stellar DEX prices & historical sparkline points
      const assetsWithPrices = await Promise.all(
        baseSnapshot.assets.map(async (asset) => {
          const { history, change24h } = await fetchStellarDexPrices(
            asset.code,
            asset.issuer,
            controller.signal,
          )
          const latestPrice = history[history.length - 1] ?? (asset.value / (asset.balance || 1))
          return {
            ...asset,
            value: asset.balance * latestPrice,
            history: history.length > 1 ? history : asset.history,
            change24h: change24h !== undefined ? change24h : asset.change24h,
          }
        }),
      )

      if (controller.signal.aborted) return

      const nextSnapshot: WalletSnapshot = {
        ...baseSnapshot,
        assets: assetsWithPrices,
      }

      hasSnapshotRef.current = true
      setSnapshot(nextSnapshot)
      setError(null)
      setStatus('ready')
    } catch (cause) {
      if (controller.signal.aborted) return

      setError(cause instanceof Error ? cause.message : ErrorMessage[ErrorCode.GEN_INTERNAL_ERROR])
      setStatus('error')
    } finally {
      if (!controller.signal.aborted) setIsRefreshing(false)
    }
  }, [address])

  useEffect(() => {
    void load()

    const unsubscribeStream = subscribeToWalletStream(address, {
      onBalanceChange: () => void load(),
      onError: () => setIsLive(false),
    })

    if (unsubscribeStream) {
      setIsLive(true)
    }

    const interval = setInterval(() => void load(), BALANCE_POLL_INTERVAL_MS)
    return () => {
      if (unsubscribeStream) {
        setIsLive(false)
        unsubscribeStream()
      }
      clearInterval(interval)
      requestRef.current?.abort()
    }
  }, [address, load])

  // Subscribe to live DEX price updates via WebSocket or 10s price polling
  useEffect(() => {
    if (!snapshot || snapshot.assets.length === 0) return

    const unsubscribePrices = subscribeToStellarPriceFeed(snapshot.assets, (updatedAssets) => {
      setSnapshot((prev) => (prev ? { ...prev, assets: updatedAssets } : prev))
    })

    return () => {
      unsubscribePrices()
    }
  }, [snapshot?.assets.length])

  const refresh = useCallback(() => void load(), [load])

  return { snapshot, status, error, isRefreshing, isLive, refresh }
}

export interface UseQuickStatsState {
  stats: QuickStatsData | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Hook to retrieve live, dynamic Quick Stats (Total Transactions, Network Fee Saved, Account Age).
 */
export function useQuickStats(addressProp?: string): UseQuickStatsState {
  const address = resolveWalletAddress(addressProp)
  const [stats, setStats] = useState<QuickStatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchQuickStats(address)
      setStats(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load quick stats.')
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    void load()
  }, [load])

  return { stats, loading, error, refresh: load }
}
