'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Send, ArrowDownLeft, TrendingUp, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WalletCard } from '@/components/wallet-card'
import { PortfolioSummaryCard } from '@/components/portfolio-summary-card'
import { TransactionRow } from '@/components/transaction-row'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { MASKED_AMOUNT, useHideBalances } from '@/hooks/use-hide-balances'
import { InlineEmpty, InlineError, InlineSkeleton } from '@/components/inline-state'
import { groupAssets, portfolioChange24h, totalValue } from '@/features/dashboard/models'
import { useWalletBalances, useQuickStats } from '@/features/dashboard/state'
import { fetchTransactions } from '@/features/history/services'
import { useOptimisticTransactions } from '@/features/history/state'
import type { Transaction, OptimisticTransaction } from '@/features/history/models'
import { ThemeToggle } from '@/components/theme-toggle'
import { useTranslation } from '@/lib/i18n'

interface DashboardPageProps {
  address?: string
}

export function DashboardPage({ address }: DashboardPageProps = {}) {
  const { t } = useTranslation()
  const { isHidden, toggle } = useHideBalances()
  const { snapshot, status, error, isRefreshing, isLive, refresh } =
    useWalletBalances(address)
  const { stats } = useQuickStats(snapshot?.address ?? address)
  const { optimisticEntries } = useOptimisticTransactions()

  const [realTransactions, setRealTransactions] = useState<Transaction[]>([])
  const [isTxLoading, setIsTxLoading] = useState(true)

  const loadRecentTransactions = useCallback(async () => {
    setIsTxLoading(true)
    try {
      const res = await fetchTransactions({ limit: 5 })
      setRealTransactions(res.data)
    } catch {
      setRealTransactions([
        {
          id: '1',
          type: 'sent',
          asset: 'XLM',
          amount: 100.0,
          recipient: 'GBJCHUKZMTFSLOMNC7P4TS4VJJBTCYL3YCWKEANE7FCNHWHP6ZPWPX3',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
          status: 'confirmed',
        },
        {
          id: '2',
          type: 'received',
          asset: 'USDC',
          amount: 500.0,
          recipient: 'GBJCHUKZMTFSLOMNC7P4TS4VJJBTCYL3YCWKEANE7FCNHWHP6ZPWPX3',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          status: 'confirmed',
        },
        {
          id: '3',
          type: 'sent',
          asset: 'AQUA',
          amount: 50.0,
          recipient: 'GAJDLFWC3H2LMYMVLYWE3MID4YSKKFVDBMPUEPBJ4PBGQRGKQTKJLXDX',
          timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000),
          status: 'pending',
        },
      ])
    } finally {
      setIsTxLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRecentTransactions()
  }, [loadRecentTransactions])

  const recentTransactions = useMemo<Array<Transaction | OptimisticTransaction>>(() => {
    return [...optimisticEntries, ...realTransactions].slice(0, 5)
  }, [optimisticEntries, realTransactions])

  const handleRefresh = useCallback(() => {
    refresh()
    void loadRecentTransactions()
  }, [refresh, loadRecentTransactions])

  const assets = useMemo(() => snapshot?.assets ?? [], [snapshot])
  const groups = useMemo(() => groupAssets(assets), [assets])
  const portfolioValue = useMemo(() => totalValue(assets), [assets])
  const dailyChange = useMemo(() => portfolioChange24h(assets), [assets])
  const isPositive = dailyChange >= 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="px-6 py-8 max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">{t('dashboard.title')}</h1>
              <p className="text-muted-foreground mt-1">
                {t('dashboard.welcome')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Button
                variant="outline"
                onClick={toggle}
                aria-pressed={isHidden}
                aria-label={isHidden ? t('common.show') : t('common.hide')}
              >
                {isHidden ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                {isHidden ? t('common.show') : t('common.hide')}
              </Button>
              <Link href="/receive">
                <Button variant="outline">
                  <ArrowDownLeft className="mr-2 h-4 w-4" />
                  {t('common.receive')}
                </Button>
              </Link>
              <Link href="/send">
                <Button className="bg-primary hover:bg-primary/90">
                  <Send className="mr-2 h-4 w-4" />
                  {t('common.send')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
          {/* Portfolio summary */}
          {status === 'loading' && !snapshot && (
            <div
              role="status"
              aria-live="polite"
              className="h-56 rounded-2xl border border-border bg-card animate-pulse"
            >
              <span className="sr-only">{t('dashboard.loadingBalances')}</span>
            </div>
          )}

          {status === 'error' && !snapshot && (
            <InlineError
              title="Could not load your balances"
              message={error ?? 'Please try again in a moment.'}
              onRetry={handleRefresh}
            />
          )}

          {snapshot && (
            <>
              {status === 'error' && error && (
                <InlineError
                  title="Balances may be out of date"
                  message={error}
                  onRetry={handleRefresh}
                />
              )}
              <PortfolioSummaryCard
                address={snapshot.address}
                totalValue={portfolioValue}
                change24h={dailyChange}
                assetCount={assets.length}
                updatedAt={snapshot.updatedAt}
                isRefreshing={isRefreshing}
                isLive={isLive}
                hideAmounts={isHidden}
                onToggleHideAmounts={toggle}
                onRefresh={handleRefresh}
              />
            </>
          )}

          {/* Assets, grouped by asset kind */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground">{t('dashboard.assets')}</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  {t('dashboard.assetsSubtitle')}
                </p>
              </div>
              {snapshot && assets.length > 0 && (
                <div
                  className={`flex items-center gap-2 ${isPositive ? 'text-primary' : 'text-red-500'}`}
                >
                  <TrendingUp size={16} />
                  <span className="text-sm font-medium">
                    Portfolio {isPositive ? 'up' : 'down'} {Math.abs(dailyChange).toFixed(1)}% today
                  </span>
                </div>
              )}
            </div>

            {status === 'loading' && !snapshot && (
              <InlineSkeleton count={6} label="Loading assets" />
            )}

            {status === 'error' && !snapshot && (
              <InlineError
                title="Assets unavailable"
                message={error ?? 'We could not reach the wallet service.'}
                onRetry={handleRefresh}
              />
            )}

            {snapshot && assets.length === 0 && (
              <InlineEmpty
                title={t('dashboard.noAssetsTitle')}
                description={t('dashboard.noAssetsDesc')}
                action={
                  <Link href="/receive">
                    <Button variant="outline">
                      <ArrowDownLeft className="mr-2 h-4 w-4" />
                      {t('dashboard.receiveFunds')}
                    </Button>
                  </Link>
                }
              />
            )}

            {groups.length > 0 && (
              <div className="space-y-8">
                {groups.map((group) => (
                  <section key={group.category} aria-labelledby={`asset-group-${group.category}`}>
                    <div className="flex items-baseline justify-between mb-3">
                      <div>
                        <h3
                          id={`asset-group-${group.category}`}
                          className="text-sm font-semibold uppercase tracking-wide text-foreground"
                        >
                          {group.label}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">{group.description}</p>
                      </div>
                      <p className="text-sm font-semibold text-primary">
                        {isHidden ? MASKED_AMOUNT : `$${group.totalValue.toFixed(2)}`}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {group.assets.map((asset) => (
                        <WalletCard
                          key={`${asset.code}-${asset.issuer}`}
                          asset={asset}
                          hideAmounts={isHidden}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          {/* Recent Transactions */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground">{t('dashboard.recentTransactions')}</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  {t('dashboard.recentTxSubtitle')}
                </p>
              </div>
              <Link href="/history">
                <Button variant="ghost">{t('dashboard.viewAll')}</Button>
              </Link>
            </div>
            {isTxLoading && recentTransactions.length === 0 ? (
              <div className="bg-card rounded-xl border border-border p-6 space-y-3 animate-pulse">
                <div className="h-12 w-full rounded bg-muted" />
                <div className="h-12 w-full rounded bg-muted" />
                <div className="h-12 w-full rounded bg-muted" />
              </div>
            ) : recentTransactions.length === 0 ? (
              <InlineEmpty
                title={t('dashboard.noTxTitle')}
                description={t('dashboard.noTxDesc')}
              />
            ) : (
              <div className="bg-card rounded-xl border border-border divide-y divide-border overflow-hidden">
                {recentTransactions.map((tx) => {
                  const key = 'optimisticId' in tx ? tx.optimisticId : tx.id
                  return <TransactionRow key={key} transaction={tx} />
                })}
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card rounded-xl border border-border p-6">
              <p className="text-muted-foreground text-sm">{t('dashboard.totalTransactions')}</p>
              <p className="text-3xl font-bold text-primary mt-2">
                {stats ? stats.totalTransactions : 156}
              </p>
              <p className="text-xs text-muted-foreground mt-2">{t('dashboard.allTimeStellar')}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-6">
              <p className="text-muted-foreground text-sm">{t('dashboard.networkFeeSaved')}</p>
              <p className="text-3xl font-bold text-green-500 mt-2">
                {isHidden
                  ? MASKED_AMOUNT
                  : stats
                    ? `$${stats.networkFeeSavedUsd.toFixed(2)}`
                    : '$127.85'}
              </p>
              <p className="text-xs text-muted-foreground mt-2">{t('dashboard.vsTraditional')}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-6">
              <p className="text-muted-foreground text-sm">{t('dashboard.accountAge')}</p>
              <p className="text-3xl font-bold text-foreground mt-2">
                {stats ? `${stats.accountAgeDays} ${t('dashboard.days')}` : `432 ${t('dashboard.days')}`}
              </p>
              <p className="text-xs text-muted-foreground mt-2">{t('dashboard.activeMember')}</p>
            </div>
          </div>
        </div>
      </PullToRefresh>
    </div>
  )
}
