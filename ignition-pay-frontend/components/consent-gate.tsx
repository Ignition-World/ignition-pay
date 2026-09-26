'use client'

import { Analytics } from '@vercel/analytics/next'
import { useAnalyticsConsent } from '@/hooks/use-consent'

export function ConsentGate() {
  const { consented } = useAnalyticsConsent()

  if (!consented) return null

  return <Analytics />
}
