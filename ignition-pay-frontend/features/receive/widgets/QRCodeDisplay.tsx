'use client'

// Issue #461: QR code component using the `qrcode` npm package's browser canvas API.
// Replaces the fake random grid that previously rendered on the Receive page.

import { useEffect, useRef, useState, useCallback } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface QRCodeDisplayHandle {
  /** Triggers a PNG download of the rendered QR canvas. */
  downloadQR: () => void
}

interface QRCodeDisplayProps {
  /** The Stellar wallet address (or any string) to encode. */
  address: string
  /** Canvas size in pixels – width and height are equal. Defaults to 256. */
  size?: number
  /** Optional ref that exposes the downloadQR helper to the parent. */
  handleRef?: React.MutableRefObject<QRCodeDisplayHandle | null>
}

/**
 * Renders a scannable QR code on a <canvas> element using the `qrcode` package.
 * - SSR-safe: the canvas + QR generation only runs in the browser.
 * - Accessible: the canvas carries an aria-label describing its content.
 * - Provides a built-in Download button and exposes downloadQR() to parents
 *   via the optional `handleRef` prop.
 */
export function QRCodeDisplay({ address, size = 256, handleRef }: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Generate the QR code whenever the address or size changes.
  useEffect(() => {
    // SSR guard – canvas APIs only exist in the browser.
    if (typeof window === 'undefined') return
    if (!address) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // Dynamically import `qrcode` so it is never bundled for the server.
    import('qrcode')
      .then((QRCode) => {
        const canvas = canvasRef.current
        if (!canvas) return
        return QRCode.toCanvas(canvas, address, {
          width: size,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        })
      })
      .then(() => setLoading(false))
      .catch((err) => {
        console.error('[QRCodeDisplay] Failed to generate QR code:', err)
        setError('Failed to generate QR code')
        setLoading(false)
      })
  }, [address, size])

  // Expose downloadQR to the parent component through the optional ref.
  const downloadQR = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `stellar-address-qr.png`
    link.click()
  }, [])

  useEffect(() => {
    if (handleRef) {
      handleRef.current = { downloadQR }
    }
  }, [handleRef, downloadQR])

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Canvas container – always rendered so the ref resolves immediately */}
      <div
        className="rounded-lg border-8 border-primary bg-white p-2 flex items-center justify-center"
        style={{ width: size + 24, height: size + 24 }}
        aria-busy={loading}
      >
        {loading && (
          <div
            className="flex items-center justify-center text-muted-foreground text-sm"
            style={{ width: size, height: size }}
            role="status"
            aria-live="polite"
          >
            Generating QR code…
          </div>
        )}
        {error && !loading && (
          <div
            className="flex items-center justify-center text-destructive text-sm text-center"
            style={{ width: size, height: size }}
            role="alert"
          >
            {error}
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          aria-label={`QR code for Stellar address ${address}`}
          role="img"
          className={loading || error ? 'hidden' : ''}
        />
      </div>

      {/* Built-in download button */}
      <Button
        variant="outline"
        size="sm"
        onClick={downloadQR}
        disabled={loading || !!error || !address}
        aria-label="Download QR code as PNG"
      >
        <Download className="mr-2 h-4 w-4" />
        Download QR
      </Button>
    </div>
  )
}
