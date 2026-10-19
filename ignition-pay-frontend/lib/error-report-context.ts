/**
 * Session context attached to crash reports so a recurring error can be
 * correlated with a user session in Sentry. Safe to call from the global error
 * boundary: it runs outside the app's providers, so it reads the browser
 * directly, and never throws.
 */

const WALLET_ADDRESS_KEY = 'ignition:wallet:address'
const LOCALE_STORAGE_KEY = 'ignition_pay_locale'

export interface ErrorReportContext {
  walletAddress?: string
  locale: string
}

function readStorage(storage: () => Storage, key: string): string | undefined {
  try {
    return storage().getItem(key) ?? undefined
  } catch {
    // Storage can be blocked or unavailable (private mode, SSR).
    return undefined
  }
}

export function getErrorReportContext(): ErrorReportContext {
  if (typeof window === 'undefined') return { locale: 'unknown' }

  const walletAddress = readStorage(() => window.sessionStorage, WALLET_ADDRESS_KEY)
  const locale =
    readStorage(() => window.localStorage, LOCALE_STORAGE_KEY) ??
    document.documentElement.lang ??
    navigator.language ??
    'unknown'

  return { walletAddress: walletAddress || undefined, locale: locale || 'unknown' }
}
