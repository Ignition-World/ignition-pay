'use client'

import { useEffect, useState } from 'react'
import { Navigation } from './navigation'
import { OnboardingTour } from './onboarding-tour'
import { LanguageProvider, useTranslation } from '@/lib/i18n'
import { subscribeToWalletNetworkChanges } from '@/lib/wallet-network'

/**
 * Announces when the connected wallet switched network. Balance hooks listen
 * for the same event and reload, so the notice and the data change together.
 */
function WalletNetworkNotice() {
  const { t } = useTranslation()
  const [network, setNetwork] = useState<string | null>(null)

  useEffect(() => subscribeToWalletNetworkChanges((change) => setNetwork(change.network)), [])

  if (!network) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground shadow-lg lg:bottom-6"
    >
      <span>{t('wallet.networkSwitched', { network })}</span>
      <button
        type="button"
        onClick={() => setNetwork(null)}
        aria-label={t('common.hide')}
        className="text-muted-foreground hover:text-foreground"
      >
        ×
      </button>
    </div>
  )
}

export function AppWrapper({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <div className="flex min-h-screen bg-background">
        <Navigation />
        {/* pb-16 keeps content clear of the mobile bottom tab bar */}
        <main className="flex-1 lg:ml-64 mt-16 lg:mt-0 pb-16 lg:pb-0">
          {children}
        </main>
      </div>
      <OnboardingTour />
      <WalletNetworkNotice />
    </LanguageProvider>
  )
}
