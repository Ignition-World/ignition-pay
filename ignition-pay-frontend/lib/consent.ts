'use client'

const CONSENT_KEY = 'analytics_consent'

export function getStoredConsent(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(CONSENT_KEY) === 'true'
}

export function storeConsent(consented: boolean): void {
  localStorage.setItem(CONSENT_KEY, String(consented))
}
