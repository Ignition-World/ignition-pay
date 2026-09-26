'use client'

import { useState, useEffect, useCallback } from 'react'
import { getStoredConsent, storeConsent } from '@/lib/consent'

export function useAnalyticsConsent() {
  const [consented, setConsentedState] = useState(false)

  useEffect(() => {
    setConsentedState(getStoredConsent())
  }, [])

  const setConsented = useCallback((value: boolean) => {
    setConsentedState(value)
    storeConsent(value)
  }, [])

  return { consented, setConsented }
}
