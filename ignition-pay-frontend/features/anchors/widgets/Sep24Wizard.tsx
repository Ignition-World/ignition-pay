'use client'

import { useMemo } from 'react'
import {
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Banknote,
} from 'lucide-react'

import { INTERACTIVE_TIMEOUT_MS } from '@/features/anchors/services'
import { MAX_DECIMAL_PLACES } from '@/features/send/models'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { Sep24WizardState, Sep24Operation, QuoteResponse } from '@/features/anchors/models'
import { SEP24_STATUS_LABELS, isSep24Terminal } from '@/features/anchors/services'

const SUPPORTED_ASSETS = [
  { code: 'USD', issuer: undefined, label: 'US Dollar' },
  { code: 'EUR', issuer: undefined, label: 'Euro' },
  { code: 'GBP', issuer: undefined, label: 'British Pound' },
  { code: 'INR', issuer: undefined, label: 'Indian Rupee' },
  { code: 'PHP', issuer: undefined, label: 'Philippine Peso' },
  { code: 'THB', issuer: undefined, label: 'Thai Baht' },
  { code: 'USDC', issuer: 'GBBD47UZQ5ODSQIRQ73RQ5NBAYKU5NK2HRE3ENDQMAIL7UCHQVCD2Z4A', label: 'USD Coin' },
]

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  incomplete: Clock,
  pending_user_transfer_start: Clock,
  pending_external: RefreshCw,
  pending_anchor: RefreshCw,
  pending_stellar: RefreshCw,
  pending_trust: Clock,
  pending_user: Clock,
  completed: CheckCircle2,
  no_market: XCircle,
  too_small: AlertTriangle,
  too_large: AlertTriangle,
  expired: XCircle,
  error: XCircle,
}

const STATUS_COLORS: Record<string, string> = {
  incomplete: 'text-muted-foreground',
  pending_user_transfer_start: 'text-amber-500',
  pending_external: 'text-blue-500',
  pending_anchor: 'text-blue-500',
  pending_stellar: 'text-blue-500',
  pending_trust: 'text-amber-500',
  pending_user: 'text-amber-500',
  completed: 'text-green-500',
  no_market: 'text-destructive',
  too_small: 'text-destructive',
  too_large: 'text-destructive',
  expired: 'text-destructive',
  error: 'text-destructive',
}

interface Sep24WizardProps {
  state: Sep24WizardState
  onClose: () => void
  onSetOperation: (op: Sep24Operation) => void
  onSetAssetCode: (code: string) => void
  onSetAssetIssuer: (issuer?: string) => void
  onSetAmount: (amount: string) => void
  onGetQuote: () => void
  onConfirmQuote: (stellarAccount: string) => void
  onReset: () => void
}

export default function Sep24Wizard({
  state,
  onClose,
  onSetOperation,
  onSetAssetCode,
  onSetAssetIssuer,
  onSetAmount,
  onGetQuote,
  onConfirmQuote,
  onReset,
}: Sep24WizardProps) {
  const canSubmit = useMemo(() => {
    return state.amount.length > 0 && parseFloat(state.amount) > 0 && !state.isSubmitting
  }, [state.amount, state.isSubmitting])

  // Local error handling for interactive timeout/fallback
  const [interactiveError, setInteractiveError] = useState<string | null>(null)
  const [interactiveTimer, setInteractiveTimer] = useState<NodeJS.Timeout | null>(null)

  // Start a timeout when the interactive step begins
  useEffect(() => {
    if (state.step === 'interactive' && state.interactiveUrl) {
      const timer = setTimeout(() => {
        setInteractiveError('The interactive flow timed out. Please try again.')
      }, INTERACTIVE_TIMEOUT_MS)
      setInteractiveTimer(timer)
    }
    // Cleanup on step change or unmount
    return () => {
      if (interactiveTimer) clearTimeout(interactiveTimer)
    }
  }, [state.step, state.interactiveUrl])

  const selectedAsset = SUPPORTED_ASSETS.find((a) => a.code === state.assetCode)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onGetQuote()
  }

  const handleIframeLoad = () => {
    // When the iframe loads, clear any pending timeout and move to tracking step after a delay
    if (interactiveTimer) clearTimeout(interactiveTimer)
    setInteractiveError(null)
    // Existing logic (if any) can remain here
  }

  const progressPercent = useMemo(() => {
    const steps = ['operation', 'form', 'quote', 'interactive', 'tracking', 'completed']
    const idx = state.step === 'error' ? 4 : steps.indexOf(state.step)
    return Math.round(((idx + 1) / steps.length) * 100)
  }, [state.step])

  return (
    <Dialog open={state.open} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {state.operation === 'deposit' ? 'Deposit' : state.operation === 'withdraw' ? 'Withdraw' : 'Transfer'} via {state.anchorName}
          </DialogTitle>
          <DialogDescription>
            {state.step === 'operation' && 'Choose whether to deposit or withdraw funds'}
            {state.step === 'form' && 'Enter the amount and asset details'}
            {state.step === 'quote' && 'Review your quote before continuing'}
            {state.step === 'interactive' && 'Complete the interactive flow with the anchor'}
            {state.step === 'completed' && state.status && isSep24Terminal(state.status.status) && state.status.status !== 'completed'
              ? 'Transaction did not complete'
              : state.step === 'completed'
                ? 'Transaction completed successfully'
                : ''}
            {state.step === 'error' && 'An error occurred'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        {state.step !== 'completed' && state.step !== 'error' && (
          <div className="w-full bg-muted rounded-full h-1.5 mb-6">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Step: Choose operation */}
        {state.step === 'operation' && (
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => onSetOperation('deposit')}
              className="flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer bg-card"
            >
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <ArrowDownLeft size={32} className="text-green-500" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">Deposit</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Move fiat or crypto into your wallet
                </p>
              </div>
            </button>
            <button
              onClick={() => onSetOperation('withdraw')}
              className="flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer bg-card"
            >
              <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center">
                <ArrowUpRight size={32} className="text-blue-500" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">Withdraw</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Move funds from your wallet to a bank or external account
                </p>
              </div>
            </button>
          </div>
        )}

        {/* Step: Form */}
        {state.step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Asset
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SUPPORTED_ASSETS.map((asset) => (
                    <button
                      key={asset.code}
                      type="button"
                      onClick={() => {
                        onSetAssetCode(asset.code)
                        onSetAssetIssuer(asset.issuer)
                      }}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                        state.assetCode === asset.code
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-background hover:border-primary/30'
                      }`}
                    >
                      <span className="text-lg font-bold text-foreground">{asset.code}</span>
                      <span className="text-[11px] text-muted-foreground">{asset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Amount
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">
                    {state.assetCode === 'USDC' ? '' : '$'}
                  </span>
                  <input
                    type="text" inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-lg font-semibold"
                    value={state.amount}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === "") {
                        onSetAmount(val)
                        return
                      }
                      const regex = new RegExp(`^\\d*\\.?\\d{0,${MAX_DECIMAL_PLACES}}$`)
                      if (regex.test(val)) {
                        onSetAmount(val)
                      }
                    }}
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-lg p-4">
                <Banknote size={20} className="text-primary flex-shrink-0" />
                <div className="text-sm text-foreground">
                  <p className="font-semibold">
                    {state.operation === 'deposit' ? 'Deposit' : 'Withdraw'} {state.amount || '0'} {state.assetCode}
                  </p>
                  <p className="text-muted-foreground">
                    You will be redirected to {state.anchorName}&apos;s secure interface to complete this transaction
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => onClose()}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-primary hover:bg-primary/90"
                disabled={!canSubmit}
              >
                {state.isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                Continue to {state.anchorName}
              </Button>
            </div>
          </form>
        )}

        {/* Step: Quote */}
        {state.step === 'quote' && state.quote && (
          <div className="space-y-6">
            <div className="bg-card rounded-xl border border-primary/30 p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Banknote size={24} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">Quote Received</p>
                    <p className="text-sm text-muted-foreground">
                      Rate from {state.anchorName}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  Expires {new Date(state.quote.expiresAt).toLocaleTimeString()}
                </Badge>
              </div>

              <div className="bg-muted/30 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">You send</span>
                  <span className="text-lg font-bold text-foreground">
                    {parseFloat(state.quote.sellAmount).toFixed(2)} {state.quote.sellAsset}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Exchange rate</span>
                  <span className="text-sm font-semibold text-foreground">
                    1 {state.quote.sellAsset} = {state.quote.price} {state.quote.buyAsset}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">You receive</span>
                  <span className="text-lg font-bold text-green-500">
                    {parseFloat(state.quote.buyAmount).toFixed(2)} {state.quote.buyAsset}
                  </span>
                </div>
                {state.quote.fee && (
                  <div className="border-t border-border pt-3 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Fee</span>
                    <span className="text-sm font-semibold text-foreground">
                      {state.quote.fee.total} {state.quote.fee.asset}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => onReset()}>
                Edit Amount
              </Button>
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                disabled={state.isSubmitting}
                onClick={() => onConfirmQuote('GABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMN')}
              >
                {state.isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                Confirm & Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step: Interactive / Tracking */}
        {(state.step === 'interactive' || state.step === 'tracking') && (
          <div className="space-y-4">
            {/* Interactive iframe */}
            {interactiveError ? (
              <div className="p-4 bg-destructive/10 rounded-md text-destructive">
                <p className="font-semibold mb-2">{interactiveError}</p>
                <Button variant="outline" onClick={onReset}>Retry</Button>
              </div>
            ) : (
              state.interactiveUrl ? (
                <iframe
                  src={state.interactiveUrl}
                  className="w-full h-96 border border-border rounded"
                  onLoad={handleIframeLoad}
                  onError={() => setInteractiveError('Failed to load interactive flow. Please try again.')}
                />
              ) : (
                <div className="p-4 bg-muted/10 rounded-md text-muted-foreground">
                  <p className="font-medium mb-2">Interactive URL not available.</p>
                  <Button variant="outline" onClick={onReset}>Retry</Button>
                </div>
              )
            )}
            {/* Status display */}
            <div>
              <p className="text-sm font-semibold text-foreground">
                {SEP24_STATUS_LABELS[state.status.status] ?? state.status.status}
              </p>
              {state.status.statusDesc && (
                <p className="text-xs text-muted-foreground">{state.status.statusDesc}</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => onClose()}>
                Close
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  if (state.anchorTxId) {
                    const anchorName = state.anchorName
                    const txId = state.anchorTxId
                    window.open(
                      `/sep24/interactive-simulator?txId=${txId}&operation=${state.operation}&asset=${state.assetCode}`,
                      '_blank',
                      'width=800,height=700',
                    )
                  }
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in Popup
              </Button>
            </div>
          </div>
        )}

        {/* Step: Completed */}
        {state.step === 'completed' && state.status && (
          <div className="space-y-6">
            {state.status.status === 'completed' ? (
              <div className="bg-card rounded-xl border border-primary/30 p-8 text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 size={48} className="text-green-500" />
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground">
                    {state.operation === 'deposit' ? 'Deposit' : 'Withdrawal'} Complete
                  </h3>
                  <p className="text-muted-foreground mt-2">
                    Your {state.operation} of {state.amount} {state.assetCode} via{' '}
                    {state.anchorName} was successful.
                  </p>
                </div>
                <div className="bg-muted/30 rounded-lg p-4 text-left space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span className="flex items-center gap-1.5 text-green-500 font-semibold">
                      <CheckCircle2 size={14} />
                      Completed
                    </span>
                  </div>
                  {state.status.stellarTxHash && (
                    <div className="border-t border-border pt-3 flex items-center justify-between">
                      <span className="text-muted-foreground">Stellar Tx Hash</span>
                      <span className="text-foreground font-mono text-xs">
                        {state.status.stellarTxHash.slice(0, 8)}...{state.status.stellarTxHash.slice(-8)}
                      </span>
                    </div>
                  )}
                  {state.status.amountOut && (
                    <div className="border-t border-border pt-3 flex items-center justify-between">
                      <span className="text-muted-foreground">Amount Received</span>
                      <span className="text-foreground font-semibold">{state.status.amountOut}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-destructive/30 p-8 text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                    <XCircle size={48} className="text-destructive" />
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground">
                    {state.operation === 'deposit' ? 'Deposit' : 'Withdrawal'} Not Completed
                  </h3>
                  <p className="text-muted-foreground mt-2">
                    {state.status.statusDesc ?? SEP24_STATUS_LABELS[state.status.status]}
                  </p>
                </div>
                {state.status.message && (
                  <div className="bg-muted/30 rounded-lg p-4 text-sm text-foreground">
                    {state.status.message}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onReset}>
                Try Again
              </Button>
              <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={() => onClose()}>
                Done
              </Button>
            </div>
          </div>
        )}

        {/* Step: Error */}
        {state.step === 'error' && (
          <div className="space-y-6">
            <div className="bg-card rounded-xl border border-destructive/30 p-8 text-center space-y-6">
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                  <XCircle size={48} className="text-destructive" />
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-foreground">Something went wrong</h3>
                {state.error && (
                  <p className="text-muted-foreground mt-2">{state.error}</p>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Close
              </Button>
              <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={onReset}>
                Try Again
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

