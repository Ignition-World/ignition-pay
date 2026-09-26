'use client'

// Issues #460 + #462:
//   #460 – Remove MOCK_ADDRESS; derive the wallet address from a prop or
//           sessionStorage (key: 'ignition:wallet:address') as a runtime fallback.
//   #462 – Wire Share Address (navigator.share with clipboard fallback),
//           add Copy Address + Memo combined button, wire Download QR.

import { useState, useRef, useEffect } from 'react'
import { Copy, Share2 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { QRCodeDisplay, type QRCodeDisplayHandle } from './QRCodeDisplay'

// ---------------------------------------------------------------------------
// useWalletAddress – returns address from prop → sessionStorage → empty string
// ---------------------------------------------------------------------------
function useWalletAddress(addressProp?: string): string {
  const [address, setAddress] = useState<string>(addressProp ?? '')

  useEffect(() => {
    // Only run in the browser; prop takes precedence over sessionStorage.
    if (typeof window === 'undefined') return
    if (addressProp) {
      setAddress(addressProp)
      return
    }
    const stored = sessionStorage.getItem('ignition:wallet:address')
    if (stored) setAddress(stored)
  }, [addressProp])

  return address
}

// ---------------------------------------------------------------------------
// ReceivePage
// ---------------------------------------------------------------------------

interface ReceivePageProps {
  /**
   * The authenticated user's Stellar wallet address.
   * When provided it takes precedence over the sessionStorage fallback.
   */
  address?: string
}

export function ReceivePage({ address: addressProp }: ReceivePageProps) {
  const address = useWalletAddress(addressProp)

  // Memo state – kept in sync with copy-all and share actions.
  const [memo, setMemo] = useState('')
  const [showMemo, setShowMemo] = useState(false)

  // Toast-style feedback flags.
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [copiedAddressMemo, setCopiedAddressMemo] = useState(false)
  const [shared, setShared] = useState(false)

  // Ref handle that lets us call downloadQR() on the QRCodeDisplay component.
  const qrHandleRef = useRef<QRCodeDisplayHandle | null>(null)

  // -------------------------------------------------------------------------
  // Clipboard helpers
  // -------------------------------------------------------------------------

  const copyAddress = () => {
    navigator.clipboard.writeText(address).then(() => {
      setCopiedAddress(true)
      setTimeout(() => setCopiedAddress(false), 2000)
    })
  }

  const copyAddressAndMemo = () => {
    const text = memo
      ? `Address: ${address}\nMemo: ${memo}`
      : `Address: ${address}`
    navigator.clipboard.writeText(text).then(() => {
      setCopiedAddressMemo(true)
      setTimeout(() => setCopiedAddressMemo(false), 2000)
    })
  }

  // -------------------------------------------------------------------------
  // Share Address – navigator.share with clipboard fallback (#462)
  // -------------------------------------------------------------------------

  const shareAddress = async () => {
    const shareText = address + (memo ? ` Memo: ${memo}` : '')
    const shareData: ShareData = {
      title: 'My Stellar Address',
      text: shareText,
      url: window.location.href,
    }

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData)
        setShared(true)
        setTimeout(() => setShared(false), 2000)
      } catch (err) {
        // User cancelled or browser rejected – fall through to clipboard copy.
        console.warn('[ReceivePage] navigator.share rejected, falling back to clipboard:', err)
        navigator.clipboard.writeText(shareText)
      }
    } else {
      // Fallback: copy to clipboard when Web Share API is unavailable.
      await navigator.clipboard.writeText(shareText)
      setShared(true)
      setTimeout(() => setShared(false), 2000)
    }
  }

  // -------------------------------------------------------------------------
  // Download QR – delegates to QRCodeDisplay via the handle ref
  // -------------------------------------------------------------------------

  const triggerDownloadQR = () => {
    qrHandleRef.current?.downloadQR()
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

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
          <h1 className="text-3xl font-bold text-foreground">Receive Payment</h1>
          <p className="text-muted-foreground mt-1">
            Share your address to receive XLM, USDC, and other Stellar assets
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="space-y-8">
          {/* QR Code Section – #461: real scannable QR via QRCodeDisplay */}
          <div className="bg-card rounded-2xl border border-primary/30 p-8 flex flex-col items-center gap-6">
            {address ? (
              /* #461 – real QR code rendered from the actual wallet address */
              <QRCodeDisplay
                address={address}
                size={256}
                handleRef={qrHandleRef}
              />
            ) : (
              <EmptyState
                illustration="receive"
                title="No wallet address yet"
                description="Sign in to load your Stellar address and start receiving assets."
                className="w-full border-0 bg-transparent p-0 sm:p-0"
              />
            )}
            <div className="text-center">
              <p className="text-muted-foreground text-sm">
                Scan this QR code to receive a payment
              </p>
            </div>
          </div>

          {/* Address Section */}
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-3">
                Your Stellar Address
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={address || 'Loading address…'}
                  readOnly
                  aria-label="Your Stellar wallet address"
                  className="w-full px-4 py-4 rounded-lg bg-muted/50 border border-border text-foreground font-mono text-sm pr-12"
                />
                <button
                  onClick={copyAddress}
                  disabled={!address}
                  aria-label="Copy address to clipboard"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                >
                  <Copy size={20} />
                </button>
              </div>
              {copiedAddress && (
                <p className="text-xs text-primary mt-2" role="status">
                  Address copied!
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 pt-2">
              {/* Share Address – #462: navigator.share with clipboard fallback */}
              <Button
                variant="outline"
                className="flex-1"
                onClick={shareAddress}
                disabled={!address}
                aria-label="Share wallet address"
              >
                <Share2 className="mr-2 h-4 w-4" />
                {shared ? 'Shared!' : 'Share Address'}
              </Button>

              {/* Download QR – delegates to QRCodeDisplay */}
              <Button
                variant="outline"
                className="flex-1"
                onClick={triggerDownloadQR}
                disabled={!address}
                aria-label="Download QR code as PNG"
              >
                Download QR
              </Button>
            </div>

            {/* Copy Address + Memo – #462 */}
            <Button
              variant="outline"
              className="w-full"
              onClick={copyAddressAndMemo}
              disabled={!address}
              aria-label="Copy address and memo to clipboard"
            >
              <Copy className="mr-2 h-4 w-4" />
              {copiedAddressMemo ? 'Copied!' : 'Copy Address + Memo'}
            </Button>
          </div>

          {/* Memo Section */}
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Payment Memo</h3>
              <button
                onClick={() => setShowMemo(!showMemo)}
                className="text-sm text-primary hover:text-primary/80 transition-colors"
                aria-expanded={showMemo}
              >
                {showMemo ? 'Hide' : 'Show'}
              </button>
            </div>

            {showMemo && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Add a memo to identify incoming payments. The sender must include this memo with their transaction.
                </p>
                <input
                  type="text"
                  placeholder="Enter a payment memo (optional)"
                  maxLength={28}
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  aria-label="Payment memo"
                  className="w-full px-4 py-3 rounded-lg bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
                <p className="text-xs text-muted-foreground">
                  Memo helps you identify and categorize incoming payments
                </p>
              </div>
            )}
          </div>

          {/* Asset Info */}
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Assets You Can Receive</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="font-bold text-primary">X</span>
                </div>
                <p className="font-semibold text-foreground">XLM</p>
                <p className="text-xs text-muted-foreground">Stellar Lumens - Native asset</p>
              </div>
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="font-bold text-blue-500">U</span>
                </div>
                <p className="font-semibold text-foreground">USDC</p>
                <p className="text-xs text-muted-foreground">USD Coin - Stablecoin</p>
              </div>
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <span className="font-bold text-green-500">A</span>
                </div>
                <p className="font-semibold text-foreground">AQUA</p>
                <p className="text-xs text-muted-foreground">Aquarius Token - DEX Token</p>
              </div>
            </div>
          </div>

          {/* Safety Tips */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-6 space-y-3">
            <h3 className="font-semibold text-foreground">Safety Tips</h3>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
              <li>Always verify you&apos;re sharing your address with trusted parties</li>
              <li>Never share your private key or seed phrase</li>
              <li>Use memos to help identify large payments</li>
              <li>You can safely share your public address with anyone</li>
            </ul>
          </div>

          <div>
            <Link href="/dashboard">
              <Button variant="outline" className="w-full">
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
