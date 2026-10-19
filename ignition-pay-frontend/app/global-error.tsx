'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { getErrorReportContext } from '@/lib/error-report-context'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    const { walletAddress, locale } = getErrorReportContext()
    Sentry.withScope((scope) => {
      scope.setTag('locale', locale)
      if (walletAddress) {
        // A public Stellar address identifies the session without being a secret.
        scope.setUser({ id: walletAddress })
        scope.setTag('wallet_address', walletAddress)
      }
      scope.setContext('session', { locale, walletAddress: walletAddress ?? null })
      Sentry.captureException(error)
    })
  }, [error])

  return (
    <html>
      <body>
        <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
          <div className="text-center">
            <h1 className="text-4xl font-bold">Something went wrong</h1>
            <p className="mt-4 text-muted-foreground">An unexpected error occurred. Please try again.</p>
            <button
              onClick={reset}
              className="mt-6 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/80"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
