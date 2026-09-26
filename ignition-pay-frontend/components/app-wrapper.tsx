'use client'

import { Navigation } from './navigation'
import { LanguageProvider } from '@/lib/i18n'

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
    </LanguageProvider>
  )
}

