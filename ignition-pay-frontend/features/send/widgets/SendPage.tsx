'use client'

import { useEffect, useMemo, useState } from 'react'
import { Send, Zap, AlertCircle, CheckCircle2, CheckCircle, Loader2, ClipboardPaste } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { validateStellarAddress } from '@/lib/stellar/strkey'
import {
  MEMO_TEXT_MAX_BYTES,
  MEMO_TYPES,
  MEMO_TYPE_HINTS,
  MEMO_TYPE_LABELS,
  memoByteLength,
  validateMemo,
  type MemoType,
} from '@/lib/stellar/memo'
import { AssetAmountPicker } from '@/components/asset-amount-picker'
import { validateAmount, type SendableAsset } from '@/features/send/models'
import { checkTrustline, type TrustlineCheck } from '@/features/send/services'
import { useOptimisticTransactions } from '@/features/history/state'
import { useToast } from '@/components/ui/toast'
import { API_BASE_URLS, API_PREFIX } from '@/lib/constants/api'

import { useWalletBalances } from '@/features/dashboard/state'

const ADDRESS_KIND_LABELS = {
  publicKey: 'Stellar account',
  muxedAccount: 'Muxed account',
  contract: 'Contract address',
} as const

const DEFAULT_SENDABLE_ASSETS: SendableAsset[] = [
  { code: 'XLM', issuer: 'native', balance: 5234.5, reserved: 1.5 },
  {
    code: 'USDC',
    issuer: 'GBBD47UZQ5ODSQIRQ73RQ5NBAYKU5NK2HRE3ENDQMAIL7UCHQVCD2Z4A',
    balance: 2150.75,
  },
  {
    code: 'AQUA',
    issuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTGKCYEG5MFWQVMBNXA5W2HAT',
    balance: 125.3,
  },
]

interface SendPageProps {
  address?: string
}

export function SendPage({ address: addressProp }: SendPageProps = {}) {
  const { snapshot } = useWalletBalances(addressProp)
  const { addOptimisticEntry, reconcileEntry, removeOptimisticEntry } = useOptimisticTransactions()
  const toast = useToast()

  const sendableAssets: SendableAsset[] = useMemo(() => {
    if (snapshot?.assets && snapshot.assets.length > 0) {
      return snapshot.assets.map((asset) => ({
        code: asset.code,
        issuer: asset.issuer,
        balance: asset.balance,
        reserved: asset.code === 'XLM' || asset.issuer === 'native' ? 1.5 : undefined,
      }))
    }
    return DEFAULT_SENDABLE_ASSETS
  }, [snapshot])

  const [step, setStep] = useState<'form' | 'review' | 'confirmed'>('form')
  const [recipientTouched, setRecipientTouched] = useState(false)
  const [formData, setFormData] = useState({
    recipient: '',
    amount: '',
    asset: 'XLM',
    memoType: 'none' as MemoType,
    memo: '',
  })
  const [trustline, setTrustline] = useState<TrustlineCheck | null>(null)
  const [isCheckingTrustline, setIsCheckingTrustline] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [optimisticId, setOptimisticId] = useState<string | null>(null)

  const selectedAsset =
    sendableAssets.find((asset) => asset.code === formData.asset) ?? sendableAssets[0]
  const amountCheck = useMemo(
    () => validateAmount(formData.amount, selectedAsset),
    [formData.amount, selectedAsset],
  )

  // Verify the recipient can hold the asset once the review step is reached, so
  // a missing trustline is surfaced before the payment is confirmed.
  useEffect(() => {
    if (step !== 'review') return

    const controller = new AbortController()
    setIsCheckingTrustline(true)
    setTrustline(null)

    checkTrustline(formData.recipient, selectedAsset.code, selectedAsset.issuer, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setTrustline(result)
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsCheckingTrustline(false)
      })

    return () => controller.abort()
  }, [step, formData.recipient, selectedAsset.code, selectedAsset.issuer])

  const recipientCheck = useMemo(
    () => validateStellarAddress(formData.recipient),
    [formData.recipient],
  )
  const memoCheck = useMemo(
    () => validateMemo(formData.memoType, formData.memo),
    [formData.memoType, formData.memo],
  )

  const showRecipientError =
    recipientTouched && formData.recipient.length > 0 && !recipientCheck.isValid
  const canReview = recipientCheck.isValid && memoCheck.isValid && amountCheck.isValid

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canReview) return
    setStep('review')
  }

  const handleConfirm = async () => {
    setIsSubmitting(true)

    const txId = addOptimisticEntry({
      type: 'sent',
      asset: formData.asset,
      amount: parseFloat(formData.amount),
      recipient: formData.recipient,
      timestamp: new Date(),
    })
    setOptimisticId(txId)

    try {
      const senderWalletId = process.env.NEXT_PUBLIC_SENDER_WALLET_ID
      if (!senderWalletId) throw new Error('No sender wallet is configured for payments.')

      const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || API_BASE_URLS.development).replace(/\/$/, '')
      const response = await fetch(baseUrl + API_PREFIX + '/payments/' + senderWalletId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          senderWalletId,
          recipientAddress: formData.recipient,
          amount: formData.amount,
          assetCode: formData.asset,
        }),
      })
      if (!response.ok) throw new Error('Payment submission failed (' + response.status + ')')

      reconcileEntry(txId)
      setOptimisticId(null)
      setStep('confirmed')
      toast.add({
        title: 'Payment submitted',
        description: 'Payment of ' + formData.amount + ' ' + formData.asset + ' was queued.',
        type: 'success',
      })
    } catch (error) {
      removeOptimisticEntry(txId)
      setOptimisticId(null)
      toast.add({
        title: 'Transaction failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        type: 'error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Paste a copied address directly into the recipient field, matching the
  // trimming behavior of manual typing so pasted whitespace doesn't cause a
  // spurious validation error.
  const handlePasteRecipient = async () => {
    if (!navigator.clipboard?.readText) {
      toast.add({
        title: 'Clipboard unavailable',
        description: 'Your browser does not support pasting from the clipboard here.',
        type: 'error',
      })
      return
    }

    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) return
      setFormData((prev) => ({ ...prev, recipient: text.trim() }))
      setRecipientTouched(true)
    } catch {
      toast.add({
        title: 'Paste failed',
        description: 'Allow clipboard access in your browser to paste the address.',
        type: 'error',
      })
    }
  }

  const handleReset = () => {
    setStep('form')
    setRecipientTouched(false)
    setFormData({ recipient: '', amount: '', asset: 'XLM', memoType: 'none', memo: '' })
  }

  if (step === 'confirmed') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-2xl border border-primary/30 p-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-green-500" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Payment Sent!</h2>
              <p className="text-muted-foreground mt-2">
                Your {formData.amount} {formData.asset} has been sent successfully.
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-left space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Recipient</p>
                <p className="text-foreground font-mono text-xs">
                  {formData.recipient.slice(0, 8)}...
                  {formData.recipient.slice(-8)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Amount</p>
                <p className="text-foreground font-semibold">
                  {formData.amount} {formData.asset}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Network Fee</p>
                <p className="text-foreground font-semibold">0.00001 XLM</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleReset}
              >
                Send Another
              </Button>
              <Link href="/dashboard" className="flex-1">
                <Button className="w-full bg-primary hover:bg-primary/90">
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="px-6 py-8 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="p-0 h-auto">
                ← Back
              </Button>
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Send Payment</h1>
          <p className="text-muted-foreground mt-1">
            Transfer XLM, USDC, or other Stellar assets instantly
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <div
            className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold transition-all ${
              step === 'form' || step === 'review' || step === 'confirmed'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            1
          </div>
          <div
            className={`flex-1 h-1 transition-all ${
              step === 'review' || step === 'confirmed' ? 'bg-primary' : 'bg-muted'
            }`}
          />
          <div
            className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold transition-all ${
              step === 'review' || step === 'confirmed'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            2
          </div>
          <div
            className={`flex-1 h-1 transition-all ${
              step === 'confirmed' ? 'bg-primary' : 'bg-muted'
            }`}
          />
          <div
            className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold transition-all ${
              step === 'confirmed'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            3
          </div>
        </div>

        {/* Form Step */}
        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-6 space-y-6">
              <div>
                <label
                  htmlFor="recipient-address"
                  className="block text-sm font-semibold text-foreground mb-2"
                >
                  Recipient Address
                </label>
                <div className="relative">
                  <input
                    id="recipient-address"
                    type="text"
                    placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                    className={`w-full pl-4 pr-12 py-3 rounded-lg bg-background border text-foreground placeholder:text-muted-foreground focus:outline-none font-mono text-sm ${
                      showRecipientError
                        ? 'border-destructive focus:border-destructive'
                        : recipientCheck.isValid
                          ? 'border-green-500/60 focus:border-green-500'
                          : 'border-border focus:border-primary'
                    }`}
                    value={formData.recipient}
                    onChange={(e) =>
                      setFormData({ ...formData, recipient: e.target.value.trim() })
                    }
                    onBlur={() => setRecipientTouched(true)}
                    aria-invalid={showRecipientError}
                    aria-describedby="recipient-feedback"
                    autoCapitalize="characters"
                    spellCheck={false}
                    required
                  />
                  <button
                    type="button"
                    onClick={handlePasteRecipient}
                    aria-label="Paste from clipboard"
                    title="Paste from clipboard"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ClipboardPaste size={16} />
                  </button>
                </div>
                <p
                  id="recipient-feedback"
                  aria-live="polite"
                  className={`text-xs mt-2 flex items-center gap-1.5 ${
                    showRecipientError
                      ? 'text-destructive'
                      : recipientCheck.isValid
                        ? 'text-green-500'
                        : 'text-muted-foreground'
                  }`}
                >
                  {showRecipientError ? (
                    <>
                      <AlertCircle size={13} />
                      {recipientCheck.error}
                    </>
                  ) : recipientCheck.isValid && recipientCheck.kind ? (
                    <>
                      <CheckCircle size={13} />
                      Valid {ADDRESS_KIND_LABELS[recipientCheck.kind]} — checksum verified
                    </>
                  ) : (
                    'The Stellar address you want to send funds to'
                  )}
                </p>
              </div>

              <AssetAmountPicker
                assets={sendableAssets}
                selectedCode={formData.asset}
                amount={formData.amount}
                onAssetChange={(asset) => setFormData((prev) => ({ ...prev, asset }))}
                onAmountChange={(amount) => setFormData((prev) => ({ ...prev, amount }))}
              />

              <div>
                <label
                  htmlFor="memo-type"
                  className="block text-sm font-semibold text-foreground mb-2"
                >
                  Memo (Optional)
                </label>
                <select
                  id="memo-type"
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:border-primary"
                  value={formData.memoType}
                  onChange={(e) =>
                    // Switching type invalidates the previous value's format.
                    setFormData({ ...formData, memoType: e.target.value as MemoType, memo: '' })
                  }
                >
                  {MEMO_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {MEMO_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>

                {formData.memoType !== 'none' && (
                  <div className="mt-3">
                    <input
                      type="text"
                      aria-label={`Memo ${MEMO_TYPE_LABELS[formData.memoType]}`}
                      placeholder={
                        formData.memoType === 'text'
                          ? 'Invoice 1042'
                          : formData.memoType === 'id'
                            ? '1234567890'
                            : '64 hex characters'
                      }
                      className={`w-full px-4 py-3 rounded-lg bg-background border text-foreground placeholder:text-muted-foreground focus:outline-none ${
                        formData.memo && !memoCheck.isValid
                          ? 'border-destructive focus:border-destructive'
                          : 'border-border focus:border-primary'
                      } ${formData.memoType === 'hash' ? 'font-mono text-sm' : ''}`}
                      value={formData.memo}
                      onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                      aria-invalid={Boolean(formData.memo) && !memoCheck.isValid}
                      aria-describedby="memo-feedback"
                      inputMode={formData.memoType === 'id' ? 'numeric' : 'text'}
                    />
                    {formData.memoType === 'text' && (
                      <p className="text-xs text-muted-foreground mt-1 text-right">
                        {memoByteLength(formData.memo)}/{MEMO_TEXT_MAX_BYTES} bytes
                      </p>
                    )}
                  </div>
                )}

                <p
                  id="memo-feedback"
                  aria-live="polite"
                  className={`text-xs mt-2 ${
                    formData.memo && !memoCheck.isValid
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  }`}
                >
                  {formData.memo && memoCheck.error
                    ? memoCheck.error
                    : MEMO_TYPE_HINTS[formData.memoType]}
                </p>

                {memoCheck.warning && (
                  <div className="mt-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex gap-2">
                    <AlertCircle size={16} className="text-yellow-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-foreground">{memoCheck.warning}</p>
                  </div>
                )}
              </div>

              <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 flex gap-3">
                <Zap size={20} className="text-primary flex-shrink-0 mt-0.5" />
                <div className="text-sm text-foreground">
                  <p className="font-semibold">Lightning-fast settlement</p>
                  <p className="text-muted-foreground">
                    Stellar transactions settle in about 5 seconds with minimal fees.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Link href="/dashboard" className="flex-1">
                <Button variant="outline" className="w-full">Cancel</Button>
              </Link>
              <Button
                type="submit"
                className="flex-1 bg-primary hover:bg-primary/90"
                disabled={!canReview}
              >
                <Send className="mr-2 h-4 w-4" />
                Review Payment
              </Button>
            </div>
          </form>
        )}

        {/* Review Step */}
        {step === 'review' && (
          <div className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-6 space-y-6">
              <h2 className="text-xl font-bold text-foreground">Review Payment</h2>

              <div className="space-y-4 bg-muted/30 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Recipient Address</span>
                  <span className="font-mono text-sm text-foreground">
                    {formData.recipient.slice(0, 8)}...
                    {formData.recipient.slice(-8)}
                  </span>
                </div>
                <div className="border-t border-border pt-4 flex items-center justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="text-2xl font-bold text-primary">
                    {formData.amount} {formData.asset}
                  </span>
                </div>
                <div className="border-t border-border pt-4 flex items-center justify-between">
                  <span className="text-muted-foreground">Network Fee</span>
                  <span className="font-semibold text-foreground">0.00001 XLM</span>
                </div>
                <div className="border-t border-border pt-4 flex items-center justify-between">
                  <span className="text-muted-foreground">Recipient trustline</span>
                  {isCheckingTrustline ? (
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />
                      Checking…
                    </span>
                  ) : trustline?.status === 'ok' ? (
                    <Badge variant="success">Ready to receive</Badge>
                  ) : trustline?.status === 'missing' ? (
                    <Badge variant="destructive">No {formData.asset} trustline</Badge>
                  ) : trustline?.status === 'unfunded' ? (
                    <Badge variant="destructive">Account not funded</Badge>
                  ) : (
                    <Badge variant="warning">Not verified</Badge>
                  )}
                </div>
                {formData.memoType !== 'none' && formData.memo && (
                  <div className="border-t border-border pt-4">
                    <p className="text-muted-foreground text-sm mb-1">
                      Memo ({MEMO_TYPE_LABELS[formData.memoType]})
                    </p>
                    <p
                      className={`text-foreground ${
                        formData.memoType === 'hash' ? 'font-mono text-xs break-all' : ''
                      }`}
                    >
                      {formData.memo}
                    </p>
                  </div>
                )}
              </div>

              {trustline?.message && (
                <div
                  role="alert"
                  className={`rounded-lg p-4 flex gap-3 border ${
                    trustline.status === 'unknown'
                      ? 'bg-yellow-500/10 border-yellow-500/30'
                      : 'bg-destructive/10 border-destructive/30'
                  }`}
                >
                  <AlertCircle
                    size={20}
                    className={`flex-shrink-0 mt-0.5 ${
                      trustline.status === 'unknown' ? 'text-yellow-500' : 'text-destructive'
                    }`}
                  />
                  <div className="text-sm text-foreground">
                    <p className="font-semibold">
                      {trustline.status === 'unknown'
                        ? 'Trustline not verified'
                        : 'This payment will likely fail'}
                    </p>
                    <p className="text-muted-foreground">{trustline.message}</p>
                  </div>
                </div>
              )}

              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex gap-3">
                <AlertCircle size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-foreground">
                  <p className="font-semibold">Please review carefully</p>
                  <p className="text-muted-foreground">
                    Transactions on blockchain are permanent and cannot be reversed.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep('form')}
              >
                Back to Edit
              </Button>
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                onClick={handleConfirm}
                disabled={isCheckingTrustline || trustline?.status === 'unfunded' || isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : isCheckingTrustline ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {trustline?.status === 'missing' ? 'Send anyway' : 'Confirm & Send'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}