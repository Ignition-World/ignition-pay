"use client"

import React, { useEffect, useState } from 'react'
import { ArrowUpRight, ArrowDownLeft, Lock, History, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Sep24Wizard from './Sep24Wizard'
import { useSep24Wizard, useAnchorHistory } from '@/features/anchors/state'
import type { AnchorHistoryItem } from '@/features/anchors/models'
import { SEP24_STATUS_LABELS } from '@/features/anchors/services'

const statusStyles = {
  Online: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
  Maintenance: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
  Offline: 'border-rose-500/30 bg-rose-500/10 text-rose-600',
} as const

const statusDotStyles = {
  Online: 'bg-emerald-500',
  Maintenance: 'bg-amber-500',
  Offline: 'bg-rose-500',
} as const

const DEFAULT_ANCHORS = [
  {
    id: 1,
    name: 'StellarX',
    description: 'Fast USD on/off ramps with verified anchors',
    icon: 'SX',
    supported: ['USD', 'EUR'],
    minDeposit: 50,
    maxDeposit: 10000,
    fee: '1.5%',
    verified: true,
    sepSupport: ['SEP-6', 'SEP-24', 'SEP-31'],
    status: 'Online',
  },
  {
    id: 2,
    name: 'AnchorUSD',
    description: 'USDC liquidity and fiat settlement',
    icon: 'AU',
    supported: ['USD'],
    minDeposit: 100,
    maxDeposit: 50000,
    fee: '2.0%',
    verified: true,
    sepSupport: ['SEP-6', 'SEP-24', 'SEP-31', 'SEP-38'],
    status: 'Maintenance',
  },
  {
    id: 3,
    name: 'GateHub',
    description: 'Multi-currency anchor with market rates',
    icon: 'GH',
    supported: ['USD', 'EUR', 'GBP'],
    minDeposit: 50,
    maxDeposit: 25000,
    fee: '1.8%',
    verified: true,
    sepSupport: ['SEP-6', 'SEP-24', 'SEP-31'],
    status: 'Online',
  },
  {
    id: 4,
    name: 'PayMunk',
    description: 'Asia-focused payment anchor',
    icon: 'PM',
    supported: ['INR', 'PHP', 'THB'],
    minDeposit: 10,
    maxDeposit: 5000,
    fee: '2.5%',
    verified: false,
    sepSupport: ['SEP-6', 'SEP-24'],
    status: 'Offline',
  },
]


const HISTORY_STATUS_ICON: Record<string, typeof CheckCircle2> = {
  completed: CheckCircle2,
  error: XCircle,
  expired: XCircle,
  no_market: XCircle,
  too_small: AlertTriangle,
  too_large: AlertTriangle,
}

const HISTORY_STATUS_COLOR: Record<string, string> = {
  completed: 'text-green-500',
  error: 'text-destructive',
  expired: 'text-destructive',
  no_market: 'text-destructive',
  too_small: 'text-amber-500',
  too_large: 'text-amber-500',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function HistoryRow({ item }: { item: AnchorHistoryItem }) {
  const Icon = HISTORY_STATUS_ICON[item.status] ?? Clock
  const iconColor = HISTORY_STATUS_COLOR[item.status] ?? 'text-muted-foreground'
  const label = SEP24_STATUS_LABELS[item.status] ?? item.status

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
          item.operation === 'deposit' ? 'bg-green-500/10' : 'bg-blue-500/10'
        }`}>
          {item.operation === 'deposit'
            ? <ArrowDownLeft size={18} className="text-green-500" />
            : <ArrowUpRight size={18} className="text-blue-500" />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground capitalize">{item.operation}</span>
            <span className="text-sm text-muted-foreground">{item.assetCode}</span>
            <span className="text-xs text-muted-foreground">via {item.anchorName}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Icon size={12} className={iconColor} />
            <span className="text-xs text-muted-foreground">{label}</span>
            {item.statusDesc && (
              <span className="text-xs text-muted-foreground">· {item.statusDesc}</span>
            )}
          </div>
        </div>
      </div>
      <div className="text-right ml-4 flex-shrink-0">
        {item.amount && (
          <p className="text-sm font-semibold text-foreground">
            {item.operation === 'deposit' ? '+' : '−'}{item.amount} {item.assetCode}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{formatDate(item.startedAt)}</p>
      </div>
    </div>
  )
}

export default function AnchorsPage() {
  const wizard = useSep24Wizard()
  const history = useAnchorHistory({ page: 1, limit: 10 })

  const [anchors, setAnchors] = useState(DEFAULT_ANCHORS)

  useEffect(() => {
    let mounted = true
    fetch('/api/anchors')
      .then((r) => {
        if (!r.ok) throw new Error('no anchors')
        return r.json()
      })
      .then((data) => {
        if (!mounted) return
        if (Array.isArray(data) && data.length > 0) setAnchors(data)
      })
      .catch(() => {
        // keep defaults on error
      })
    return () => {
      mounted = false
    }
  }, [])

  const operationFilter = history.query.operation
  const totalPages = Math.ceil(history.total / history.limit)

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="px-6 py-8 max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Anchor Integrations
              </h1>
              <p className="text-muted-foreground mt-1">
                Seamlessly connect with trusted anchors for fiat on/off ramps
              </p>
            </div>
            <Link href="/dashboard">
              <Button variant="ghost">← Back</Button>
            </Link>
          </div>

          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 flex gap-3">
            <Lock size={20} className="text-primary flex-shrink-0 mt-0.5" />
            <div className="text-sm text-foreground">
              <p className="font-semibold">Secure anchor connections</p>
              <p className="text-muted-foreground">
                All anchor integrations follow SEP-6, SEP-24, SEP-31, and SEP-38 standards. Your keys remain under your control.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-foreground mb-6">
            Featured Anchors
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {anchors.slice(0, 2).map((anchor) => (
              <div
                key={anchor.id}
                className="bg-card rounded-2xl border border-primary/30 p-8 space-y-6 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold text-primary">
                      {anchor.icon}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">
                        {anchor.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {anchor.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {anchor.verified && (
                      <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-500 text-xs font-semibold">
                        Verified
                      </div>
                    )}
                    <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[anchor.status as keyof typeof statusStyles]}`}>
                      <span className={`h-2 w-2 rounded-full ${statusDotStyles[anchor.status as keyof typeof statusDotStyles]}`} />
                      {anchor.status}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {anchor.sepSupport.map((standard) => (
                    <span
                      key={standard}
                      className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary"
                    >
                      {standard}
                    </span>
                  ))}
                </div>

                <div className="space-y-3 border-t border-border pt-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Supported Currencies</span>
                    <span className="font-semibold text-foreground">
                      {anchor.supported.join(', ')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Min/Max Deposit</span>
                    <span className="font-semibold text-foreground">
                      ${anchor.minDeposit} - ${anchor.maxDeposit.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Transaction Fee</span>
                    <span className="font-semibold text-foreground">
                      {anchor.fee}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => wizard.open(anchor.name, 'deposit')}
                  >
                    <ArrowDownLeft className="mr-2 h-4 w-4" />
                    Deposit
                  </Button>
                  <Button
                    className="flex-1 bg-primary hover:bg-primary/90"
                    onClick={() => wizard.open(anchor.name, 'withdraw')}
                  >
                    <ArrowUpRight className="mr-2 h-4 w-4" />
                    Withdraw
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-foreground mb-6">
            All Available Anchors
          </h2>
          <div className="space-y-3">
            {anchors.map((anchor) => (
              <div
                key={anchor.id}
                className="bg-card rounded-xl border border-border p-6 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-foreground">
                      {anchor.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">
                          {anchor.name}
                        </h3>
                        {anchor.verified && (
                          <div className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-500 text-xs font-semibold">
                            Verified
                          </div>
                        )}
                        <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusStyles[anchor.status as keyof typeof statusStyles]}`}>
                          <span className={`h-2 w-2 rounded-full ${statusDotStyles[anchor.status as keyof typeof statusDotStyles]}`} />
                          {anchor.status}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {anchor.description}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {anchor.sepSupport.map((standard) => (
                          <span
                            key={standard}
                            className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary"
                          >
                            {standard}
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                        <span>Status: {anchor.status}</span>
                        <span>Currencies: {anchor.supported.join(', ')}</span>
                        <span>Fee: {anchor.fee}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button variant="outline" size="sm">
                      Details
                    </Button>
                    <Button
                      size="sm"
                      className="bg-primary hover:bg-primary/90"
                      onClick={() => wizard.open(anchor.name)}
                    >
                      Connect
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction History */}
        <div className="mt-12 bg-card rounded-xl border border-border p-8 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <History size={22} className="text-primary" />
              <h2 className="text-2xl font-bold text-foreground">Transaction History</h2>
              {history.total > 0 && (
                <span className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1">
                  {history.total}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Operation filter */}
              <div className="flex rounded-lg border border-border overflow-hidden text-xs font-semibold">
                {(['all', 'deposit', 'withdraw'] as const).map((op) => {
                  const active = op === 'all' ? !operationFilter : operationFilter === op
                  return (
                    <button
                      key={op}
                      onClick={() =>
                        history.setQuery({ operation: op === 'all' ? undefined : op, page: 1 })
                      }
                      className={`px-3 py-1.5 capitalize transition-colors ${
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {op}
                    </button>
                  )
                })}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={history.refresh}
                disabled={history.isLoading}
                aria-label="Refresh history"
              >
                <RefreshCw size={15} className={history.isLoading ? 'animate-spin' : ''} />
              </Button>
            </div>
          </div>

          {history.isLoading && history.items.length === 0 && (
            <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
              <RefreshCw size={18} className="animate-spin" />
              <span className="text-sm">Loading history…</span>
            </div>
          )}

          {history.error && (
            <div className="flex items-center gap-3 rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
              <XCircle size={16} className="flex-shrink-0" />
              {history.error}
            </div>
          )}

          {!history.isLoading && !history.error && history.items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <History size={40} className="opacity-30" />
              <p className="text-sm font-medium">No anchor transactions yet</p>
              <p className="text-xs">Your deposits and withdrawals will appear here</p>
            </div>
          )}

          {history.items.length > 0 && (
            <div className="divide-y divide-border -mx-2 px-2">
              {history.items.map((item) => (
                <HistoryRow key={item.id} item={item} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Page {history.page} of {totalPages} · {history.total} transactions
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => history.setQuery({ page: history.page - 1 })}
                  disabled={history.page <= 1 || history.isLoading}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => history.setQuery({ page: history.page + 1 })}
                  disabled={history.page >= totalPages || history.isLoading}
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-12 bg-card rounded-xl border border-border p-8 space-y-6">
          <h2 className="text-2xl font-bold text-foreground">
            Supported SEP Standards
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="font-semibold text-primary">SEP-6</div>
              <p className="text-sm text-muted-foreground">
                Non-interactive asset transfer
              </p>
            </div>
            <div className="space-y-2">
              <div className="font-semibold text-primary">SEP-24</div>
              <p className="text-sm text-muted-foreground">
                Interactive deposit/withdrawal
              </p>
            </div>
            <div className="space-y-2">
              <div className="font-semibold text-primary">SEP-31</div>
              <p className="text-sm text-muted-foreground">
                Cross-border direct payments
              </p>
            </div>
            <div className="space-y-2">
              <div className="font-semibold text-primary">SEP-38</div>
              <p className="text-sm text-muted-foreground">
                Anchor RFQ and pricing
              </p>
            </div>
          </div>
        </div>
      </div>

      <Sep24Wizard
        state={wizard.state}
        onClose={wizard.close}
        onSetOperation={wizard.setOperation}
        onSetAssetCode={wizard.setAssetCode}
        onSetAssetIssuer={wizard.setAssetIssuer}
        onSetAmount={wizard.setAmount}
        onGetQuote={wizard.fetchQuoteForAmount}
        onConfirmQuote={wizard.confirmQuote}
        onReset={wizard.reset}
      />
    </div>
  )
}

